// FrSky S.Port (SmartPort) sensor emulation: CRC, byte stuffing, poll
// detection and the rotating list of values reported to the transmitter.
//
// Physical layer (handled in firmware): one wire, inverted UART, 57600 8N1,
// half duplex. The receiver sends 0x7E followed by a physical-ID byte; the
// addressed sensor answers within a few ms with one 8-byte data frame
// 0x10, appId (LE u16), value (LE u32), CRC, with 0x7E/0x7D byte-stuffed.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace saillog {

namespace sport {
constexpr uint8_t kStart = 0x7E;
constexpr uint8_t kStuff = 0x7D;
constexpr uint8_t kDataFrame = 0x10;
constexpr uint8_t kNumIds = 28;

// Standard application IDs understood by EdgeTX / ETHOS.
constexpr uint16_t kVfas = 0x0210;        // V * 100
constexpr uint16_t kGpsLatLon = 0x0800;   // packed, see encodeLatLon
constexpr uint16_t kGpsSpeed = 0x0830;    // knots * 1000
constexpr uint16_t kGpsCourse = 0x0840;   // deg * 100
// DIY range (0x5000-0x52FF); shown as raw values, set the decimals on the
// transmitter (all are x10 or x100 fixed point, signed).
constexpr uint16_t kHeel = 0x5100;        // roll deg * 10 (+ = starboard down)
constexpr uint16_t kVmg = 0x5101;         // VMG knots * 100
constexpr uint16_t kHeading = 0x5102;     // yaw deg * 10
constexpr uint16_t kPitch = 0x5103;       // pitch deg * 10
}  // namespace sport

// Physical ID 0..27 -> the byte the receiver sends (ID plus parity bits).
uint8_t sportPhysIdByte(uint8_t id);

// CRC over the 7 unstuffed bytes following the start: type, id(2), value(4).
uint8_t sportCrc(const uint8_t* bytes, size_t n);

// Builds the stuffed response frame (8..16 bytes). Returns the length.
size_t sportBuildFrame(uint16_t app_id, uint32_t value, uint8_t out[16]);

// Removes stuffing and checks the CRC of a received frame (for tests and for
// sniffing other sensors). Returns true and fills app_id/value if valid.
bool sportParseFrame(const uint8_t* in, size_t n, uint16_t& app_id, uint32_t& value);

// Watches the incoming byte stream for "0x7E, our ID".
class SportPollDetector {
 public:
  explicit SportPollDetector(uint8_t phys_id = 12) : id_byte_(sportPhysIdByte(phys_id)) {}
  bool feed(uint8_t b) {
    bool hit = after_start_ && b == id_byte_;
    after_start_ = (b == sport::kStart);
    return hit;
  }

 private:
  uint8_t id_byte_;
  bool after_start_ = false;
};

uint32_t sportEncodeLatLon(double deg, bool is_lon);

struct SportValues {
  bool has_fix = false;
  double lat = 0, lon = 0;
  double sog_mps = 0, cog_deg = 0;
  bool has_att = false;
  double roll = 0, pitch = 0;
  bool has_yaw = false;
  double yaw = 0;
  bool has_vmg = false;
  double vmg_mps = 0;
  bool has_vbat = false;
  double vbat = 0;
};

// Round-robin over the values that are currently available.
class SportScheduler {
 public:
  // Returns false if nothing is available to send.
  bool next(const SportValues& v, uint16_t& app_id, uint32_t& value);

 private:
  uint8_t slot_ = 0;
  bool latlon_toggle_ = false;
};

// Speed made good towards `bearing_deg` (true).
double vmgToward(double sog_mps, double cog_deg, double bearing_deg);

}  // namespace saillog
