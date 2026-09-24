#include "saillog_csv.h"

#include <ctype.h>
#include <math.h>
#include <string.h>

#include "saillog_fmt.h"

namespace saillog {

const char kCsvHeader[] =
    "t_ms,utc_ms,gnss_new,lat,lon,sog,cog,sacc,hacc,fix,sats,yaw,roll,pitch,gx,gy,gz,ax,ay,az,"
    "rudder_us,sheet_us,aux1_us,aux2_us,vbat,event,tws,twd";

void clearRow(LogRow& r) {
  const double nan = NAN;
  r.t_ms = 0;
  r.has_utc = false;
  r.utc_ms = 0;
  r.gnss_new = false;
  r.lat = r.lon = r.sog = r.cog = r.sacc = r.hacc = nan;
  r.has_fix = false;
  r.fix = 0;
  r.sats = 0;
  r.yaw = r.roll = r.pitch = nan;
  r.gx = r.gy = r.gz = r.ax = r.ay = r.az = nan;
  for (int i = 0; i < 4; ++i) r.servo_us[i] = 0;
  r.vbat = nan;
  r.event = 0;
  r.tws = r.twd = nan;
}

size_t formatRow(const LogRow& r, char* buf, size_t cap) {
  TextWriter w(buf, cap);
  w.u64(r.t_ms);
  w.put(',');
  if (r.has_utc) w.i64(r.utc_ms);
  w.put(',');
  w.put(r.gnss_new ? '1' : '0');
  w.put(',');
  w.fixed(r.lat, 7);
  w.put(',');
  w.fixed(r.lon, 7);
  w.put(',');
  w.fixed(r.sog, 3);
  w.put(',');
  w.fixed(r.cog, 1);
  w.put(',');
  w.fixed(r.sacc, 2);
  w.put(',');
  w.fixed(r.hacc, 1);
  w.put(',');
  if (r.has_fix) w.i64(r.fix);
  w.put(',');
  if (r.has_fix) w.i64(r.sats);
  w.put(',');
  w.fixed(r.yaw, 1);
  w.put(',');
  w.fixed(r.roll, 1);
  w.put(',');
  w.fixed(r.pitch, 1);
  w.put(',');
  w.fixed(r.gx, 2);
  w.put(',');
  w.fixed(r.gy, 2);
  w.put(',');
  w.fixed(r.gz, 2);
  w.put(',');
  w.fixed(r.ax, 2);
  w.put(',');
  w.fixed(r.ay, 2);
  w.put(',');
  w.fixed(r.az, 2);
  for (int i = 0; i < 4; ++i) {
    w.put(',');
    if (r.servo_us[i] > 0) w.i64(r.servo_us[i]);
  }
  w.put(',');
  w.fixed(r.vbat, 2);
  w.put(',');
  w.i64(r.event);
  w.put(',');
  w.fixed(r.tws, 2);
  w.put(',');
  w.fixed(r.twd, 1);
  w.put('\n');
  return w.ok() ? w.len() : 0;
}

// Shortest of up to 4 decimals, e.g. 1500, 0.09, -1.2.
static void num(TextWriter& w, double v) {
  char tmp[32];
  size_t n = formatFixed(tmp, sizeof(tmp), v, 4);
  if (!n) return;
  if (strchr(tmp, '.')) {
    while (n && tmp[n - 1] == '0') tmp[--n] = '\0';
    if (n && tmp[n - 1] == '.') tmp[--n] = '\0';
  }
  if (strcmp(tmp, "-0") == 0) strcpy(tmp, "0");
  w.str(tmp);
}

static void kv(TextWriter& w, const char* k, const char* v) {
  w.str("# ");
  w.str(k);
  w.put('=');
  w.str(v);
  w.put('\n');
}

static void kvNum(TextWriter& w, const char* k, double v) {
  w.str("# ");
  w.str(k);
  w.put('=');
  num(w, v);
  w.put('\n');
}

size_t formatHeader(const HeaderInfo& h, char* buf, size_t cap) {
  const Config& c = *h.cfg;
  TextWriter w(buf, cap);
  kv(w, "format", "sail-log v1");
  kv(w, "logger", h.logger);
  kv(w, "boat", c.boat);
  kv(w, "class", c.boat_class);
  kvNum(w, "rate_hz", c.rate_hz);
  if (h.has_start_utc) {
    char iso[32];
    formatIsoUtc(iso, sizeof(iso), h.start_utc_ms);
    kv(w, "start_utc", iso);
  }
  if (c.has_declination) kvNum(w, "declination_deg", c.declination_deg);
  kv(w, "imu_mount", c.imu_mount);
  kvNum(w, "rudder_center_us", c.rudder_center_us);
  kvNum(w, "rudder_deg_per_us", c.rudder_deg_per_us);
  kvNum(w, "sheet_in_us", c.sheet_in_us);
  kvNum(w, "sheet_out_us", c.sheet_out_us);
  if (c.ch_enable[kAux1]) kv(w, "aux1_name", c.aux1_name);
  if (c.ch_enable[kAux2]) kv(w, "aux2_name", c.aux2_name);
  kv(w, "tws_source", "none");
  // Extra keys (ignored by readers that do not know them).
  if (h.board) kv(w, "board", h.board);
  if (h.file_name) kv(w, "file", h.file_name);
  kv(w, "imu_fusion", c.imu_fusion == ImuFusion::RotationVector ? "rv" : "game");
  kv(w, "yaw_ref", c.imu_fusion == ImuFusion::GameRotationVector ? "none"
                   : c.has_declination                            ? "true"
                                                                  : "magnetic");
  if (c.yaw_trim_deg != 0) kvNum(w, "yaw_trim_deg", c.yaw_trim_deg);
  if (h.has_level) {
    kvNum(w, "level_roll_deg", h.level_roll_deg);
    kvNum(w, "level_pitch_deg", h.level_pitch_deg);
  }
  kvNum(w, "gnss_rate_hz", c.gnss_rate_hz);
  w.str(kCsvHeader);
  w.put('\n');
  return w.ok() ? w.len() : 0;
}

size_t formatTrailer(const TrailerInfo& t, char* buf, size_t cap) {
  TextWriter w(buf, cap);
  if (t.has_start_utc) {
    char iso[32];
    formatIsoUtc(iso, sizeof(iso), t.start_utc_ms);
    kv(w, "start_utc", iso);
  }
  w.str("# rows=");
  w.u64(t.rows);
  w.put('\n');
  w.str("# dropped_rows=");
  w.u64(t.dropped_rows);
  w.put('\n');
  w.str("# end_t_ms=");
  w.u64(t.end_t_ms);
  w.put('\n');
  if (t.level_captures) {
    w.str("# level_captures=");
    w.u64(t.level_captures);
    w.put('\n');
  }
  return w.ok() ? w.len() : 0;
}

bool logFileName(uint32_t n, char out[16]) {
  if (n < 1 || n > 9999) return false;
  memcpy(out, "LOG0000.CSV", 12);
  for (int i = 6; i >= 3; --i) {
    out[i] = static_cast<char>('0' + n % 10);
    n /= 10;
  }
  return true;
}

uint32_t logFileNumber(const char* name) {
  if (!name) return 0;
  const char* slash = strrchr(name, '/');
  if (slash) name = slash + 1;
  if (strlen(name) != 11) return 0;
  if (toupper(static_cast<unsigned char>(name[0])) != 'L' ||
      toupper(static_cast<unsigned char>(name[1])) != 'O' ||
      toupper(static_cast<unsigned char>(name[2])) != 'G')
    return 0;
  uint32_t n = 0;
  for (int i = 3; i < 7; ++i) {
    if (!isdigit(static_cast<unsigned char>(name[i]))) return 0;
    n = n * 10 + static_cast<uint32_t>(name[i] - '0');
  }
  const char* ext = name + 7;
  if (ext[0] != '.' || toupper(static_cast<unsigned char>(ext[1])) != 'C' ||
      toupper(static_cast<unsigned char>(ext[2])) != 'S' ||
      toupper(static_cast<unsigned char>(ext[3])) != 'V')
    return 0;
  return n;
}

}  // namespace saillog
