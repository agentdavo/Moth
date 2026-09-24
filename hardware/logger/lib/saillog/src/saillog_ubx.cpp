#include "saillog_ubx.h"

#include <string.h>

#include "saillog_attitude.h"  // wrap360
#include "saillog_fmt.h"       // daysFromCivil

namespace saillog {

uint16_t ubxChecksum(const uint8_t* d, size_t n) {
  uint8_t a = 0, b = 0;
  for (size_t i = 0; i < n; ++i) {
    a = static_cast<uint8_t>(a + d[i]);
    b = static_cast<uint8_t>(b + a);
  }
  return static_cast<uint16_t>(a | (b << 8));
}

size_t ubxFrame(uint8_t cls, uint8_t id, const uint8_t* payload, uint16_t len, uint8_t* out,
                size_t cap) {
  size_t total = static_cast<size_t>(len) + 8;
  if (cap < total) return 0;
  out[0] = ubx::kSync1;
  out[1] = ubx::kSync2;
  out[2] = cls;
  out[3] = id;
  out[4] = static_cast<uint8_t>(len & 0xFF);
  out[5] = static_cast<uint8_t>(len >> 8);
  if (len) memcpy(out + 6, payload, len);
  uint16_t ck = ubxChecksum(out + 2, static_cast<size_t>(len) + 4);
  out[6 + len] = static_cast<uint8_t>(ck & 0xFF);
  out[7 + len] = static_cast<uint8_t>(ck >> 8);
  return total;
}

bool UbxParser::feed(uint8_t b) {
  switch (st_) {
    case S1:
      if (b == ubx::kSync1) st_ = S2;
      break;
    case S2:
      st_ = (b == ubx::kSync2) ? CLS : (b == ubx::kSync1 ? S2 : S1);
      break;
    case CLS:
      cka_ = ckb_ = 0;
      add(b);
      cls_ = b;
      st_ = ID;
      break;
    case ID:
      add(b);
      id_ = b;
      st_ = L1;
      break;
    case L1:
      add(b);
      len_ = b;
      st_ = L2;
      break;
    case L2:
      add(b);
      len_ = static_cast<uint16_t>(len_ | (b << 8));
      pos_ = 0;
      oversize_ = len_ > kMaxPayload;
      if (len_ > 2048) {  // nonsense length: resynchronise
        errors_++;
        st_ = S1;
      } else {
        st_ = len_ ? PAYLOAD : CKA;
      }
      break;
    case PAYLOAD:
      add(b);
      if (pos_ < kMaxPayload) buf_[pos_] = b;
      if (++pos_ >= len_) st_ = CKA;
      break;
    case CKA:
      rx_cka_ = b;
      st_ = CKB;
      break;
    case CKB:
      st_ = S1;
      if (rx_cka_ == cka_ && b == ckb_ && !oversize_) {
        frames_++;
        return true;
      }
      errors_++;
      break;
  }
  return false;
}

static uint16_t rdU2(const uint8_t* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }
static uint32_t rdU4(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}
static int32_t rdI4(const uint8_t* p) { return static_cast<int32_t>(rdU4(p)); }

bool parseNavPvt(const uint8_t* p, uint16_t len, NavPvt& o) {
  if (len < ubx::kNavPvtLen) return false;
  memset(&o, 0, sizeof(o));
  o.itow_ms = rdU4(p + 0);
  uint16_t year = rdU2(p + 4);
  uint8_t month = p[6], day = p[7], hour = p[8], minute = p[9], sec = p[10];
  uint8_t valid = p[11];
  int32_t nano = rdI4(p + 16);
  o.fix_type_raw = p[20];
  uint8_t flags = p[21];
  o.num_sv = p[23];
  o.lon_deg = rdI4(p + 24) * 1e-7;
  o.lat_deg = rdI4(p + 28) * 1e-7;
  o.hacc_m = rdU4(p + 40) * 1e-3;
  o.vel_n_mps = rdI4(p + 48) * 1e-3;
  o.vel_e_mps = rdI4(p + 52) * 1e-3;
  o.vel_d_mps = rdI4(p + 56) * 1e-3;
  o.sog_mps = rdI4(p + 60) * 1e-3;
  o.cog_deg = wrap360(rdI4(p + 64) * 1e-5);
  o.sacc_mps = rdU4(p + 68) * 1e-3;

  o.fix_ok = (flags & 0x01) != 0;
  if (!o.fix_ok) o.fix = 0;
  else if (o.fix_type_raw == 2) o.fix = 2;
  else if (o.fix_type_raw == 3 || o.fix_type_raw == 4) o.fix = 3;
  else o.fix = 0;

  o.time_valid = (valid & 0x03) == 0x03 && month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
                 hour < 24 && minute < 60 && sec <= 60 && year >= 2000;
  o.time_resolved = (valid & 0x04) != 0;
  if (o.time_valid) {
    int64_t days = daysFromCivil(year, month, day);
    int64_t ms = ((days * 24 + hour) * 60 + minute) * 60000LL + sec * 1000LL;
    // nano is -1e9..1e9; floor division to ms.
    int64_t nano_ms = nano >= 0 ? nano / 1000000 : -((-static_cast<int64_t>(nano) + 999999) / 1000000);
    o.utc_ms = ms + nano_ms;
  }
  return true;
}

ValsetBuilder::ValsetBuilder(uint8_t layers) : len_(4) {
  payload_[0] = 0x00;  // version
  payload_[1] = layers;
  payload_[2] = payload_[3] = 0;
}

bool ValsetBuilder::add(uint32_t key, uint32_t value) {
  uint8_t sizeCode = (key >> 28) & 0x07;
  uint8_t n;
  switch (sizeCode) {
    case 1:  // one bit, stored in a byte
    case 2:
      n = 1;
      break;
    case 3:
      n = 2;
      break;
    case 4:
      n = 4;
      break;
    default:
      overflow_ = true;
      return false;
  }
  if (static_cast<size_t>(len_) + 4 + n > sizeof(payload_)) {
    overflow_ = true;
    return false;
  }
  for (int i = 0; i < 4; ++i) payload_[len_++] = static_cast<uint8_t>(key >> (8 * i));
  for (int i = 0; i < n; ++i) payload_[len_++] = static_cast<uint8_t>(value >> (8 * i));
  return true;
}

size_t ValsetBuilder::build(uint8_t* out, size_t cap) const {
  if (overflow_) return 0;
  return ubxFrame(ubx::kClsCfg, ubx::kIdValset, payload_, len_, out, cap);
}

size_t buildBaudConfig(uint32_t baud, uint8_t* out, size_t cap) {
  ValsetBuilder v;
  v.add(ubx::CFG_UART1_BAUDRATE, baud);
  return v.build(out, cap);
}

size_t buildNavConfig(uint16_t rate_hz, uint8_t* out, size_t cap) {
  if (rate_hz < 1) rate_hz = 1;
  if (rate_hz > 25) rate_hz = 25;
  ValsetBuilder v;
  v.add(ubx::CFG_UART1INPROT_UBX, 1);
  v.add(ubx::CFG_UART1OUTPROT_UBX, 1);
  v.add(ubx::CFG_UART1OUTPROT_NMEA, 0);
  v.add(ubx::CFG_MSGOUT_UBX_NAV_PVT_UART1, 1);
  v.add(ubx::CFG_NAVSPG_DYNMODEL, ubx::kDynModelSea);
  v.add(ubx::CFG_RATE_MEAS, static_cast<uint32_t>((1000 + rate_hz / 2) / rate_hz));
  v.add(ubx::CFG_RATE_NAV, 1);
  if (rate_hz > 10) {
    // Up to 10 Hz the module's default constellation set is left alone.
    v.add(ubx::CFG_SIGNAL_GPS_ENA, 1);
    v.add(ubx::CFG_SIGNAL_GAL_ENA, rate_hz <= 18 ? 1 : 0);
    v.add(ubx::CFG_SIGNAL_BDS_ENA, 0);
    v.add(ubx::CFG_SIGNAL_GLO_ENA, 0);
  }
  return v.build(out, cap);
}

bool isAckFor(uint8_t cls, uint8_t id, const uint8_t* payload, uint16_t len, uint8_t ack_cls,
              uint8_t ack_id, bool& acked) {
  if (cls != ubx::kClsAck || len < 2) return false;
  if (id != ubx::kIdAck && id != ubx::kIdNak) return false;
  if (payload[0] != ack_cls || payload[1] != ack_id) return false;
  acked = (id == ubx::kIdAck);
  return true;
}

}  // namespace saillog
