// /config.txt on the SD card: `key = value` lines, `#` starts a comment.
// Unknown keys are reported and ignored; absent keys keep their defaults.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace saillog {

enum class ImuFusion : uint8_t {
  RotationVector = 0,  // gyro + accel + magnetometer: yaw referenced to magnetic north
  GameRotationVector,  // gyro + accel only: no yaw column (roll/pitch immune to magnets)
};

// Receiver channel indices used by the servo capture.
enum Channel : uint8_t { kRudder = 0, kSheet = 1, kAux1 = 2, kAux2 = 3, kNumChannels = 4 };

struct Config {
  // Metadata
  char boat[48];
  char boat_class[16];  // IOM / Moth / other
  // Logging
  uint16_t rate_hz;      // data rows per second: 10, 20, 25, 40, 50 or 100
  uint16_t fsync_s;      // fsync period on the card (1..60)
  // IMU
  char imu_mount[32];    // sensor-to-body mapping, e.g. x_fwd_y_port_z_up
  ImuFusion imu_fusion;
  float yaw_trim_deg;    // added to heading: fixes a sensor not quite aligned fore-aft
  bool has_declination;
  float declination_deg; // east positive; yaw becomes true when set
  bool level_at_boot;    // capture the level offset 3 s after power-on
  // GNSS
  uint16_t gnss_rate_hz; // 1..25
  uint32_t gnss_baud;    // UART speed the module is switched to
  uint16_t gnss_latency_ms;  // NAV-PVT arrival delay after the epoch
  // Servo capture
  bool ch_enable[kNumChannels];
  float rudder_center_us;
  float rudder_deg_per_us;
  float sheet_in_us;
  float sheet_out_us;
  char aux1_name[16];
  char aux2_name[16];
  uint16_t pulse_min_us;
  uint16_t pulse_max_us;
  // Events from a transmitter switch on a spare channel (-1 = off)
  int8_t event_channel;
  uint16_t event_threshold_us;
  // Supply
  float vbat_scale;      // divider ratio (Vin / Vadc)
  float vbat_stop;       // close the file cleanly below this voltage (0 = off)
  // FrSky S.Port telemetry
  bool sport_enable;
  uint8_t sport_id;      // physical ID 0..27
  bool has_vmg_bearing;
  float vmg_bearing_deg; // true bearing to the mark / wind axis for the VMG readout
};

void setDefaults(Config& c);

// Parses one line. Returns 1 if a key was applied, 0 for blank/comment lines,
// -1 for an unknown key, -2 for a bad value (the default is kept).
int parseConfigLine(Config& c, const char* line);

struct ConfigParseResult {
  int applied = 0;
  int unknown = 0;
  int invalid = 0;
  int first_bad_line = 0;  // 1-based, 0 if none
};

// Parses a whole file held in memory (NUL terminated, any line endings).
ConfigParseResult parseConfig(Config& c, const char* text);

// A commented default config.txt, written to a blank card on first boot.
extern const char kDefaultConfigText[];

// Parses an imu_mount string into the body-from-sensor rotation matrix
// (row-major, v_body = R * v_sensor). Returns false if the string is not a
// proper right-handed axis mapping.
bool parseMount(const char* s, double R_bs[3][3]);

}  // namespace saillog
