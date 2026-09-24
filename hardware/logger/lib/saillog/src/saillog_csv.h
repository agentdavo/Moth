// sail-log v1 file writer helpers: metadata header, column header, data rows
// and trailer, exactly as specified in docs/LOG_FORMAT.md.
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "saillog_config.h"

namespace saillog {

// Column header line (without the trailing newline).
extern const char kCsvHeader[];
constexpr int kNumColumns = 28;

// One data row. Floating fields use NaN for "missing"; integer fields have
// has_* flags. Use clearRow() to start from all-missing.
struct LogRow {
  uint32_t t_ms;
  bool has_utc;
  int64_t utc_ms;
  bool gnss_new;
  double lat, lon;               // deg
  double sog, cog, sacc, hacc;   // m/s, deg, m/s, m
  bool has_fix;
  int fix;                       // 0, 2, 3
  int sats;
  double yaw, roll, pitch;       // deg
  double gx, gy, gz;             // deg/s
  double ax, ay, az;             // m/s^2
  int32_t servo_us[4];           // rudder, sheet, aux1, aux2; <= 0 = missing
  double vbat;                   // V
  int32_t event;
  double tws, twd;
};

void clearRow(LogRow& r);

// Formats one row including the '\n'. Returns the length, or 0 if the buffer
// is too small (kMaxRowLen is always enough).
constexpr size_t kMaxRowLen = 320;
size_t formatRow(const LogRow& r, char* buf, size_t cap);

// Everything that goes into the metadata block.
struct HeaderInfo {
  const Config* cfg;
  const char* logger;      // "esp32s3-bno085-m10 fw 1.0.0"
  const char* board;       // extra key, may be null
  bool has_start_utc;
  int64_t start_utc_ms;
  bool has_level;
  double level_roll_deg, level_pitch_deg;
  const char* file_name;   // extra key, may be null
};

// Metadata lines followed by the column header line.
size_t formatHeader(const HeaderInfo& h, char* buf, size_t cap);

struct TrailerInfo {
  bool has_start_utc;
  int64_t start_utc_ms;
  uint32_t rows;
  uint32_t dropped_rows;
  uint32_t end_t_ms;
  uint32_t level_captures;  // level offset re-captured while this file was open
};

// Trailer "# key=value" lines. Its length never shrinks as the counters grow,
// so the firmware can rewrite it after every block of data.
size_t formatTrailer(const TrailerInfo& t, char* buf, size_t cap);

// "LOG0001.CSV" for n = 1. Returns false if n is out of range (1..9999).
bool logFileName(uint32_t n, char out[16]);
// Parses "LOG0042.CSV" (case-insensitive) -> 42, else 0.
uint32_t logFileNumber(const char* name);

}  // namespace saillog
