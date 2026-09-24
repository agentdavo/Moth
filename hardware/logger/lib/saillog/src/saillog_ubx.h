// u-blox UBX protocol: framing, checksum, NAV-PVT decoding and
// CFG-VALSET builders for the M10 generation (MAX-M10S, BE-880Q, ...).
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace saillog {

namespace ubx {
constexpr uint8_t kSync1 = 0xB5;
constexpr uint8_t kSync2 = 0x62;
constexpr uint8_t kClsNav = 0x01;
constexpr uint8_t kIdNavPvt = 0x07;
constexpr uint8_t kClsAck = 0x05;
constexpr uint8_t kIdAck = 0x01;
constexpr uint8_t kIdNak = 0x00;
constexpr uint8_t kClsCfg = 0x06;
constexpr uint8_t kIdValset = 0x8A;
constexpr uint16_t kNavPvtLen = 92;

// Configuration keys (u-blox M10 interface description).
constexpr uint32_t CFG_RATE_MEAS = 0x30210001;            // U2 ms
constexpr uint32_t CFG_RATE_NAV = 0x30210002;             // U2 cycles
constexpr uint32_t CFG_UART1_BAUDRATE = 0x40520001;       // U4
constexpr uint32_t CFG_UART1INPROT_UBX = 0x10730001;      // L
constexpr uint32_t CFG_UART1INPROT_NMEA = 0x10730002;     // L
constexpr uint32_t CFG_UART1OUTPROT_UBX = 0x10740001;     // L
constexpr uint32_t CFG_UART1OUTPROT_NMEA = 0x10740002;    // L
constexpr uint32_t CFG_MSGOUT_UBX_NAV_PVT_UART1 = 0x20910007;  // U1
constexpr uint32_t CFG_NAVSPG_DYNMODEL = 0x20110021;      // E1
constexpr uint32_t CFG_SIGNAL_GPS_ENA = 0x1031001f;       // L
constexpr uint32_t CFG_SIGNAL_GAL_ENA = 0x10310021;       // L
constexpr uint32_t CFG_SIGNAL_BDS_ENA = 0x10310022;       // L
constexpr uint32_t CFG_SIGNAL_QZSS_ENA = 0x10310024;      // L
constexpr uint32_t CFG_SIGNAL_GLO_ENA = 0x10310025;       // L
constexpr uint8_t kDynModelSea = 5;
constexpr uint8_t kLayerRam = 0x01;
}  // namespace ubx

// Fletcher-8 over class, id, length and payload. Returns ck_a | ck_b << 8.
uint16_t ubxChecksum(const uint8_t* data, size_t len);

// Builds a complete frame (sync, header, payload, checksum) into out.
// Returns the frame length or 0 if cap is too small.
size_t ubxFrame(uint8_t cls, uint8_t id, const uint8_t* payload, uint16_t len, uint8_t* out,
                size_t cap);

// Byte-at-a-time frame parser. Frames with bad checksums or payloads larger
// than the buffer are dropped and counted.
class UbxParser {
 public:
  // Returns true when b completes a valid frame; the frame stays readable
  // until the next call.
  bool feed(uint8_t b);
  uint8_t cls() const { return cls_; }
  uint8_t id() const { return id_; }
  uint16_t len() const { return len_; }
  const uint8_t* payload() const { return buf_; }
  uint32_t frames() const { return frames_; }
  uint32_t errors() const { return errors_; }

  static constexpr uint16_t kMaxPayload = 256;

 private:
  enum State : uint8_t { S1, S2, CLS, ID, L1, L2, PAYLOAD, CKA, CKB };
  State st_ = S1;
  uint8_t cls_ = 0, id_ = 0;
  uint16_t len_ = 0, pos_ = 0;
  uint8_t cka_ = 0, ckb_ = 0, rx_cka_ = 0;
  bool oversize_ = false;
  uint8_t buf_[kMaxPayload];
  uint32_t frames_ = 0, errors_ = 0;
  void add(uint8_t b) {
    cka_ = static_cast<uint8_t>(cka_ + b);
    ckb_ = static_cast<uint8_t>(ckb_ + cka_);
  }
};

struct NavPvt {
  uint32_t itow_ms;
  bool time_valid;       // validDate && validTime
  bool time_resolved;    // fullyResolved
  int64_t utc_ms;        // ms since 1970 (only if time_valid)
  uint8_t fix_type_raw;  // u-blox fixType 0..5
  bool fix_ok;           // gnssFixOK flag
  uint8_t fix;           // sail-log fix: 0 none, 2 2-D, 3 3-D
  uint8_t num_sv;
  double lat_deg, lon_deg;
  double hacc_m;
  double sog_mps;        // gSpeed (Doppler)
  double cog_deg;        // headMot, wrapped to [0, 360)
  double sacc_mps;
  double vel_n_mps, vel_e_mps, vel_d_mps;
};

// Decodes a NAV-PVT payload (class 0x01, id 0x07, 92 bytes).
bool parseNavPvt(const uint8_t* p, uint16_t len, NavPvt& out);

// Accumulates key/value pairs for UBX-CFG-VALSET (RAM layer).
class ValsetBuilder {
 public:
  explicit ValsetBuilder(uint8_t layers = ubx::kLayerRam);
  bool add(uint32_t key, uint32_t value);  // value size taken from the key
  // Writes the complete UBX frame; returns its length (0 on overflow).
  size_t build(uint8_t* out, size_t cap) const;
  uint16_t payloadLen() const { return len_; }

 private:
  uint8_t payload_[4 + 32 * 8];
  uint16_t len_;
  bool overflow_ = false;
};

// VALSET switching UART1 to `baud` (send at the module's current speed).
size_t buildBaudConfig(uint32_t baud, uint8_t* out, size_t cap);

// VALSET for logging: measurement rate, UBX-only output on UART1, NAV-PVT
// every epoch, dynamic model "sea". Up to 10 Hz the module's default
// constellations are kept; above 10 Hz BeiDou and GLONASS are switched off
// (and above 18 Hz Galileo too) because the M10 cannot track them all that
// fast.
size_t buildNavConfig(uint16_t rate_hz, uint8_t* out, size_t cap);

// True if the frame is an ACK/NAK for class/id; `acked` tells which.
bool isAckFor(uint8_t cls, uint8_t id, const uint8_t* payload, uint16_t len, uint8_t ack_cls,
              uint8_t ack_id, bool& acked);

}  // namespace saillog
