#include "saillog_config.h"

#include <ctype.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

namespace saillog {

const char kDefaultConfigText[] =
    "# sail-log config (see hardware/logger/README.md). key = value; lines starting with # are comments\n"
    "boat = unnamed\n"
    "class = IOM\n"
    "rate_hz = 50\n"
    "fsync_s = 5\n"
    "# IMU: sensor axes in boat terms (fwd/aft, stbd/port, down/up)\n"
    "imu_mount = x_fwd_y_port_z_up\n"
    "imu_fusion = rv\n"
    "yaw_trim_deg = 0\n"
    "# magnetic declination, east positive; leave empty to log magnetic heading\n"
    "declination_deg =\n"
    "level_at_boot = 0\n"
    "gnss_rate = 10\n"
    "gnss_baud = 115200\n"
    "gnss_latency_ms = 40\n"
    "# receiver channels wired to the logger: rudder,sheet,aux1,aux2\n"
    "channels = rudder,sheet\n"
    "rudder_center_us = 1500\n"
    "rudder_deg_per_us = 0.09\n"
    "sheet_in_us = 1100\n"
    "sheet_out_us = 1900\n"
    "aux1_name = aux1\n"
    "aux2_name = aux2\n"
    "pulse_min_us = 800\n"
    "pulse_max_us = 2200\n"
    "# event marker from a transmitter switch: none, aux1 or aux2\n"
    "event_channel = none\n"
    "event_threshold_us = 1700\n"
    "vbat_scale = 3.128\n"
    "vbat_stop = 0\n"
    "sport_enable = 0\n"
    "sport_id = 12\n"
    "vmg_bearing_deg =\n";

void setDefaults(Config& c) {
  memset(&c, 0, sizeof(c));
  strcpy(c.boat, "unnamed");
  strcpy(c.boat_class, "IOM");
  c.rate_hz = 50;
  c.fsync_s = 5;
  strcpy(c.imu_mount, "x_fwd_y_port_z_up");
  c.imu_fusion = ImuFusion::RotationVector;
  c.yaw_trim_deg = 0;
  c.has_declination = false;
  c.declination_deg = 0;
  c.level_at_boot = false;
  c.gnss_rate_hz = 10;
  c.gnss_baud = 115200;
  c.gnss_latency_ms = 40;
  c.ch_enable[kRudder] = true;
  c.ch_enable[kSheet] = true;
  c.ch_enable[kAux1] = false;
  c.ch_enable[kAux2] = false;
  c.rudder_center_us = 1500;
  c.rudder_deg_per_us = 0.09f;
  c.sheet_in_us = 1100;
  c.sheet_out_us = 1900;
  strcpy(c.aux1_name, "aux1");
  strcpy(c.aux2_name, "aux2");
  c.pulse_min_us = 800;
  c.pulse_max_us = 2200;
  c.event_channel = -1;
  c.event_threshold_us = 1700;
  c.vbat_scale = 3.128f;  // 100k over 47k
  c.vbat_stop = 0;
  c.sport_enable = false;
  c.sport_id = 12;
  c.has_vmg_bearing = false;
  c.vmg_bearing_deg = 0;
}

namespace {

// Trim in place: returns pointer to first non-space, and cuts trailing space.
char* trim(char* s) {
  while (*s && isspace(static_cast<unsigned char>(*s))) ++s;
  char* e = s + strlen(s);
  while (e > s && isspace(static_cast<unsigned char>(e[-1]))) *--e = '\0';
  return s;
}

bool ieq(const char* a, const char* b) {
  while (*a && *b) {
    if (tolower(static_cast<unsigned char>(*a)) != tolower(static_cast<unsigned char>(*b))) return false;
    ++a;
    ++b;
  }
  return *a == *b;
}

bool isNone(const char* v) { return !*v || ieq(v, "none") || ieq(v, "off") || ieq(v, "-"); }

bool parseFloat(const char* v, float lo, float hi, float& out) {
  if (!*v) return false;
  char* end = nullptr;
  double d = strtod(v, &end);
  if (end == v || *end || !isfinite(d) || d < lo || d > hi) return false;
  out = static_cast<float>(d);
  return true;
}

bool parseInt(const char* v, long lo, long hi, long& out) {
  if (!*v) return false;
  char* end = nullptr;
  long n = strtol(v, &end, 0);
  if (end == v || *end || n < lo || n > hi) return false;
  out = n;
  return true;
}

bool parseBool(const char* v, bool& out) {
  if (ieq(v, "1") || ieq(v, "yes") || ieq(v, "true") || ieq(v, "on")) {
    out = true;
    return true;
  }
  if (ieq(v, "0") || ieq(v, "no") || ieq(v, "false") || ieq(v, "off")) {
    out = false;
    return true;
  }
  return false;
}

// Copies text, replacing characters that would break the CSV metadata line.
bool copyText(char* dst, size_t cap, const char* v) {
  size_t n = strlen(v);
  if (n == 0 || n >= cap) return false;
  for (size_t i = 0; i < n; ++i) {
    char ch = v[i];
    dst[i] = (ch == '\r' || ch == '\n' || static_cast<unsigned char>(ch) < 0x20) ? ' ' : ch;
  }
  dst[n] = '\0';
  return true;
}

int channelByName(const char* v) {
  if (ieq(v, "rudder")) return kRudder;
  if (ieq(v, "sheet")) return kSheet;
  if (ieq(v, "aux1")) return kAux1;
  if (ieq(v, "aux2")) return kAux2;
  return -1;
}

}  // namespace

int parseConfigLine(Config& c, const char* line_in) {
  char line[160];
  size_t n = strlen(line_in);
  if (n >= sizeof(line)) return -2;
  memcpy(line, line_in, n + 1);
  // Whole-line comments only, so a boat name like "GBR #123" survives.
  char* s = trim(line);
  if (!*s || *s == '#') return 0;
  char* eq = strchr(s, '=');
  if (!eq) return -2;
  *eq = '\0';
  const char* key = trim(s);
  const char* v = trim(eq + 1);

  float f;
  long i;
  bool b;
  Config t = c;  // edit a copy so a bad value leaves the default untouched
  bool ok = false;

  if (ieq(key, "boat")) {
    ok = copyText(t.boat, sizeof(t.boat), v);
  } else if (ieq(key, "class")) {
    if (ieq(v, "iom")) strcpy(t.boat_class, "IOM"), ok = true;
    else if (ieq(v, "moth")) strcpy(t.boat_class, "Moth"), ok = true;
    else if (ieq(v, "other")) strcpy(t.boat_class, "other"), ok = true;
  } else if (ieq(key, "rate_hz")) {
    // Must divide 1000 so rows sit on whole milliseconds: 10/20/25/40/50/100.
    if ((ok = parseInt(v, 10, 100, i) && 1000 % i == 0)) t.rate_hz = static_cast<uint16_t>(i);
  } else if (ieq(key, "fsync_s")) {
    if ((ok = parseInt(v, 1, 60, i))) t.fsync_s = static_cast<uint16_t>(i);
  } else if (ieq(key, "imu_mount")) {
    double R[3][3];
    ok = strlen(v) < sizeof(t.imu_mount) && parseMount(v, R);
    if (ok) strcpy(t.imu_mount, v);
  } else if (ieq(key, "imu_fusion")) {
    if (ieq(v, "rv") || ieq(v, "rotation")) t.imu_fusion = ImuFusion::RotationVector, ok = true;
    else if (ieq(v, "game")) t.imu_fusion = ImuFusion::GameRotationVector, ok = true;
  } else if (ieq(key, "yaw_trim_deg")) {
    if ((ok = parseFloat(v, -180, 180, f))) t.yaw_trim_deg = f;
  } else if (ieq(key, "declination_deg")) {
    if (isNone(v)) {
      t.has_declination = false;
      ok = true;
    } else if ((ok = parseFloat(v, -90, 90, f))) {
      t.has_declination = true;
      t.declination_deg = f;
    }
  } else if (ieq(key, "level_at_boot")) {
    if ((ok = parseBool(v, b))) t.level_at_boot = b;
  } else if (ieq(key, "gnss_rate")) {
    if ((ok = parseInt(v, 1, 25, i))) t.gnss_rate_hz = static_cast<uint16_t>(i);
  } else if (ieq(key, "gnss_baud")) {
    ok = parseInt(v, 9600, 921600, i) &&
         (i == 9600 || i == 19200 || i == 38400 || i == 57600 || i == 115200 || i == 230400 ||
          i == 460800 || i == 921600);
    if (ok) t.gnss_baud = static_cast<uint32_t>(i);
  } else if (ieq(key, "gnss_latency_ms")) {
    if ((ok = parseInt(v, 0, 500, i))) t.gnss_latency_ms = static_cast<uint16_t>(i);
  } else if (ieq(key, "channels")) {
    bool en[kNumChannels] = {false, false, false, false};
    ok = true;
    if (!isNone(v)) {
      char tmp[64];
      if (strlen(v) >= sizeof(tmp)) {
        ok = false;
      } else {
        strcpy(tmp, v);
        char* sp = nullptr;
        for (char* tok = strtok_r(tmp, ", ", &sp); tok; tok = strtok_r(nullptr, ", ", &sp)) {
          int ch = channelByName(tok);
          if (ch < 0) {
            ok = false;
            break;
          }
          en[ch] = true;
        }
      }
    }
    if (ok) memcpy(t.ch_enable, en, sizeof(en));
  } else if (ieq(key, "rudder_center_us")) {
    if ((ok = parseFloat(v, 500, 2500, f))) t.rudder_center_us = f;
  } else if (ieq(key, "rudder_deg_per_us")) {
    if ((ok = parseFloat(v, -1, 1, f) && f != 0)) t.rudder_deg_per_us = f;
  } else if (ieq(key, "sheet_in_us")) {
    if ((ok = parseFloat(v, 500, 2500, f))) t.sheet_in_us = f;
  } else if (ieq(key, "sheet_out_us")) {
    if ((ok = parseFloat(v, 500, 2500, f))) t.sheet_out_us = f;
  } else if (ieq(key, "aux1_name")) {
    ok = copyText(t.aux1_name, sizeof(t.aux1_name), v);
  } else if (ieq(key, "aux2_name")) {
    ok = copyText(t.aux2_name, sizeof(t.aux2_name), v);
  } else if (ieq(key, "pulse_min_us")) {
    if ((ok = parseInt(v, 300, 1500, i))) t.pulse_min_us = static_cast<uint16_t>(i);
  } else if (ieq(key, "pulse_max_us")) {
    if ((ok = parseInt(v, 1500, 3000, i))) t.pulse_max_us = static_cast<uint16_t>(i);
  } else if (ieq(key, "event_channel")) {
    if (isNone(v)) t.event_channel = -1, ok = true;
    else if (ieq(v, "aux1")) t.event_channel = kAux1, ok = true;
    else if (ieq(v, "aux2")) t.event_channel = kAux2, ok = true;
  } else if (ieq(key, "event_threshold_us")) {
    if ((ok = parseInt(v, 900, 2100, i))) t.event_threshold_us = static_cast<uint16_t>(i);
  } else if (ieq(key, "vbat_scale")) {
    if ((ok = parseFloat(v, 0.5f, 20, f))) t.vbat_scale = f;
  } else if (ieq(key, "vbat_stop")) {
    if ((ok = parseFloat(v, 0, 30, f))) t.vbat_stop = f;
  } else if (ieq(key, "sport_enable")) {
    if ((ok = parseBool(v, b))) t.sport_enable = b;
  } else if (ieq(key, "sport_id")) {
    if ((ok = parseInt(v, 0, 27, i))) t.sport_id = static_cast<uint8_t>(i);
  } else if (ieq(key, "vmg_bearing_deg")) {
    if (isNone(v)) {
      t.has_vmg_bearing = false;
      ok = true;
    } else if ((ok = parseFloat(v, 0, 360, f))) {
      t.has_vmg_bearing = true;
      t.vmg_bearing_deg = f;
    }
  } else {
    return -1;
  }
  if (!ok) return -2;
  c = t;
  return 1;
}

ConfigParseResult parseConfig(Config& c, const char* text) {
  ConfigParseResult r;
  char line[160];
  int lineno = 0;
  const char* p = text;
  while (*p) {
    const char* e = p;
    while (*e && *e != '\n' && *e != '\r') ++e;
    ++lineno;
    size_t n = static_cast<size_t>(e - p);
    int res;
    if (n >= sizeof(line)) {
      res = -2;
    } else {
      memcpy(line, p, n);
      line[n] = '\0';
      res = parseConfigLine(c, line);
    }
    if (res == 1) r.applied++;
    if (res == -1) r.unknown++;
    if (res == -2) r.invalid++;
    if (res < 0 && !r.first_bad_line) r.first_bad_line = lineno;
    p = e;
    if (*p == '\r' && p[1] == '\n') p += 2;
    else if (*p) ++p;
  }
  return r;
}

bool parseMount(const char* s, double R[3][3]) {
  // Expected: x_<dir>_y_<dir>_z_<dir>
  char tmp[40];
  if (!s || strlen(s) >= sizeof(tmp)) return false;
  strcpy(tmp, s);
  char* sp = nullptr;
  const char* tok[6];
  int n = 0;
  for (char* t = strtok_r(tmp, "_", &sp); t && n < 7; t = strtok_r(nullptr, "_", &sp)) {
    if (n == 6) return false;
    tok[n++] = t;
  }
  if (n != 6) return false;
  static const char* const axes[3] = {"x", "y", "z"};
  for (int r = 0; r < 3; ++r)
    for (int col = 0; col < 3; ++col) R[r][col] = 0;
  bool used[3] = {false, false, false};
  for (int j = 0; j < 3; ++j) {
    if (!ieq(tok[2 * j], axes[j])) return false;
    const char* d = tok[2 * j + 1];
    int axis;
    double sign;
    if (ieq(d, "fwd")) axis = 0, sign = 1;
    else if (ieq(d, "aft")) axis = 0, sign = -1;
    else if (ieq(d, "stbd")) axis = 1, sign = 1;
    else if (ieq(d, "port")) axis = 1, sign = -1;
    else if (ieq(d, "down")) axis = 2, sign = 1;
    else if (ieq(d, "up")) axis = 2, sign = -1;
    else return false;
    if (used[axis]) return false;
    used[axis] = true;
    R[axis][j] = sign;  // column j = sensor axis j expressed in body axes
  }
  double det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
               R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
               R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  return det > 0.5;
}

}  // namespace saillog
