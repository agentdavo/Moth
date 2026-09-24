#include "saillog_sport.h"

#include <math.h>

namespace saillog {

static const uint8_t kPhysIdBytes[sport::kNumIds] = {
    0x00, 0xA1, 0x22, 0x83, 0xE4, 0x45, 0xC6, 0x67, 0x48, 0xE9, 0x6A, 0xCB, 0xAC, 0x0D,
    0x8E, 0x2F, 0xD0, 0x71, 0xF2, 0x53, 0x34, 0x95, 0x16, 0xB7, 0x98, 0x39, 0xBA, 0x1B};

uint8_t sportPhysIdByte(uint8_t id) { return kPhysIdBytes[id < sport::kNumIds ? id : 0]; }

uint8_t sportCrc(const uint8_t* b, size_t n) {
  uint16_t crc = 0;
  for (size_t i = 0; i < n; ++i) {
    crc = static_cast<uint16_t>(crc + b[i]);
    crc = static_cast<uint16_t>(crc + (crc >> 8));
    crc &= 0x00FF;
  }
  return static_cast<uint8_t>(0xFF - crc);
}

size_t sportBuildFrame(uint16_t app_id, uint32_t value, uint8_t out[16]) {
  uint8_t raw[8];
  raw[0] = sport::kDataFrame;
  raw[1] = static_cast<uint8_t>(app_id & 0xFF);
  raw[2] = static_cast<uint8_t>(app_id >> 8);
  for (int i = 0; i < 4; ++i) raw[3 + i] = static_cast<uint8_t>(value >> (8 * i));
  raw[7] = sportCrc(raw, 7);
  size_t n = 0;
  for (int i = 0; i < 8; ++i) {
    uint8_t c = raw[i];
    if (c == sport::kStart || c == sport::kStuff) {
      out[n++] = sport::kStuff;
      out[n++] = static_cast<uint8_t>(c ^ 0x20);
    } else {
      out[n++] = c;
    }
  }
  return n;
}

bool sportParseFrame(const uint8_t* in, size_t n, uint16_t& app_id, uint32_t& value) {
  uint8_t raw[8];
  size_t k = 0;
  for (size_t i = 0; i < n && k < 8; ++i) {
    uint8_t c = in[i];
    if (c == sport::kStuff) {
      if (++i >= n) return false;
      c = static_cast<uint8_t>(in[i] ^ 0x20);
    }
    raw[k++] = c;
  }
  if (k != 8 || raw[0] != sport::kDataFrame) return false;
  if (sportCrc(raw, 7) != raw[7]) return false;
  app_id = static_cast<uint16_t>(raw[1] | (raw[2] << 8));
  value = static_cast<uint32_t>(raw[3]) | (static_cast<uint32_t>(raw[4]) << 8) |
          (static_cast<uint32_t>(raw[5]) << 16) | (static_cast<uint32_t>(raw[6]) << 24);
  return true;
}

uint32_t sportEncodeLatLon(double deg, bool is_lon) {
  double minutes_e4 = fabs(deg) * 600000.0;  // minutes * 10000
  uint32_t v = static_cast<uint32_t>(minutes_e4 + 0.5) & 0x3FFFFFFF;
  if (deg < 0) v |= 0x40000000;
  if (is_lon) v |= 0x80000000;
  return v;
}

static uint32_t s32(double v) { return static_cast<uint32_t>(static_cast<int32_t>(lround(v))); }

bool SportScheduler::next(const SportValues& v, uint16_t& id, uint32_t& value) {
  const uint8_t kSlots = 8;
  for (uint8_t tries = 0; tries < kSlots; ++tries) {
    uint8_t s = slot_;
    slot_ = static_cast<uint8_t>((slot_ + 1) % kSlots);
    switch (s) {
      case 0:
        if (!v.has_fix) break;
        id = sport::kGpsSpeed;
        value = static_cast<uint32_t>(lround(v.sog_mps * 1.9438445 * 1000.0));
        return true;
      case 1:
        if (!v.has_att) break;
        id = sport::kHeel;
        value = s32(v.roll * 10.0);
        return true;
      case 2:
        if (!v.has_vmg) break;
        id = sport::kVmg;
        value = s32(v.vmg_mps * 1.9438445 * 100.0);
        return true;
      case 3:
        if (!v.has_fix) break;
        id = sport::kGpsCourse;
        value = static_cast<uint32_t>(lround(v.cog_deg * 100.0));
        return true;
      case 4:
        if (!v.has_yaw) break;
        id = sport::kHeading;
        value = s32(v.yaw * 10.0);
        return true;
      case 5:
        if (!v.has_fix) break;
        id = sport::kGpsLatLon;
        // Alternate latitude and longitude on successive visits.
        latlon_toggle_ = !latlon_toggle_;
        value = latlon_toggle_ ? sportEncodeLatLon(v.lat, false) : sportEncodeLatLon(v.lon, true);
        return true;
      case 6:
        if (!v.has_vbat) break;
        id = sport::kVfas;
        value = static_cast<uint32_t>(lround(v.vbat * 100.0));
        return true;
      case 7:
        if (!v.has_att) break;
        id = sport::kPitch;
        value = s32(v.pitch * 10.0);
        return true;
    }
  }
  return false;
}

double vmgToward(double sog, double cog, double bearing) {
  const double kRad = 3.14159265358979323846 / 180.0;
  return sog * cos((cog - bearing) * kRad);
}

}  // namespace saillog
