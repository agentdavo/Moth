// Host tests for lib/saillog. Build and run: make -C hardware/logger/test_host
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <thread>
#include <atomic>
#include <vector>

#include "saillog_attitude.h"
#include "saillog_config.h"
#include "saillog_csv.h"
#include "saillog_fmt.h"
#include "saillog_pulse.h"
#include "saillog_ringbuf.h"
#include "saillog_sport.h"
#include "saillog_ubx.h"
#include "saillog_util.h"
#include "test_util.h"

using namespace saillog;

static std::string fx(double v, int d) {
  char b[64];
  formatFixed(b, sizeof(b), v, d);
  return b;
}

// ======================================================================= fmt
TEST(fixed_point_formatting) {
  CHECK_STR(fx(50.8123456, 7), "50.8123456");
  CHECK_STR(fx(-1.3123456, 7), "-1.3123456");
  CHECK_STR(fx(0.125, 2), "0.13");
  CHECK_STR(fx(-0.004, 2), "0.00");  // never "-0.00"
  CHECK_STR(fx(-0.4, 2), "-0.40");
  CHECK_STR(fx(1.0, 0), "1");
  CHECK_STR(fx(359.96, 1), "360.0");
  CHECK_STR(fx(-9.62, 2), "-9.62");
  CHECK_STR(fx(NAN, 2), "");
  CHECK_STR(fx(INFINITY, 2), "");
  char small[4];
  CHECK(formatFixed(small, sizeof(small), 123.45, 2) == 0);
}

TEST(iso_utc_and_civil_dates) {
  char b[32];
  formatIsoUtc(b, sizeof(b), 0);
  CHECK_STR(b, "1970-01-01T00:00:00Z");
  formatIsoUtc(b, sizeof(b), 1790158502020LL);
  CHECK_STR(b, "2026-09-23T10:15:02Z");
  CHECK(daysFromCivil(2024, 2, 29) + 1 == daysFromCivil(2024, 3, 1));
  CHECK(daysFromCivil(2000, 1, 1) == 10957);
  for (int64_t d = -1000; d < 30000; d += 37) {
    int y;
    unsigned m, dd;
    civilFromDays(d, y, m, dd);
    CHECK(daysFromCivil(y, m, dd) == d);
  }
}

// ======================================================================= csv
TEST(csv_header_matches_spec) {
  CHECK_STR(kCsvHeader,
            "t_ms,utc_ms,gnss_new,lat,lon,sog,cog,sacc,hacc,fix,sats,yaw,roll,pitch,gx,gy,gz,ax,ay,"
            "az,rudder_us,sheet_us,aux1_us,aux2_us,vbat,event,tws,twd");
  int commas = 0;
  for (const char* p = kCsvHeader; *p; ++p) commas += *p == ',';
  CHECK(commas == kNumColumns - 1);
}

TEST(csv_row_reproduces_spec_example) {
  LogRow r;
  clearRow(r);
  r.t_ms = 120020;
  r.has_utc = true;
  r.utc_ms = 1790158502020LL;
  r.gnss_new = true;
  r.lat = 50.8123456;
  r.lon = -1.3123456;
  r.sog = 1.132;
  r.cog = 41.2;
  r.sacc = 0.05;
  r.hacc = 1.1;
  r.has_fix = true;
  r.fix = 3;
  r.sats = 17;
  r.yaw = 43.9;
  r.roll = 11.4;
  r.pitch = 0.8;
  r.gx = 0.12;
  r.gy = -0.40;
  r.gz = 1.35;
  r.ax = 0.20;
  r.ay = 1.61;
  r.az = -9.62;
  r.servo_us[0] = 1512;
  r.servo_us[1] = 1160;
  r.vbat = 5.02;
  r.event = 0;
  char buf[kMaxRowLen];
  size_t n = formatRow(r, buf, sizeof(buf));
  CHECK(n > 0);
  CHECK_STR(buf,
            "120020,1790158502020,1,50.8123456,-1.3123456,1.132,41.2,0.05,1.1,3,17,43.9,11.4,0.8,"
            "0.12,-0.40,1.35,0.20,1.61,-9.62,1512,1160,,,5.02,0,,\n");
}

TEST(csv_row_all_missing) {
  LogRow r;
  clearRow(r);
  r.t_ms = 20;
  char buf[kMaxRowLen];
  formatRow(r, buf, sizeof(buf));
  CHECK_STR(buf, "20,,0,,,,,,,,,,,,,,,,,,,,,,,0,,\n");
  int commas = 0;
  for (char* p = buf; *p; ++p) commas += *p == ',';
  CHECK(commas == kNumColumns - 1);
}

TEST(csv_row_worst_case_fits) {
  LogRow r;
  clearRow(r);
  r.t_ms = 4294967295u;
  r.has_utc = true;
  r.utc_ms = 4102444800000LL;
  r.gnss_new = true;
  r.lat = -89.9999999;
  r.lon = -179.9999999;
  r.sog = 99.999;
  r.cog = 359.9;
  r.sacc = 99.99;
  r.hacc = 9999.9;
  r.has_fix = true;
  r.fix = 3;
  r.sats = 99;
  r.yaw = 359.9;
  r.roll = -179.9;
  r.pitch = -89.9;
  r.gx = r.gy = r.gz = -2000.0;
  r.ax = r.ay = r.az = -156.96;
  for (int i = 0; i < 4; ++i) r.servo_us[i] = 2200;
  r.vbat = 12.60;
  r.event = 999999;
  r.tws = 30.0;
  r.twd = 359.9;
  char buf[kMaxRowLen];
  size_t n = formatRow(r, buf, sizeof(buf));
  CHECK(n > 0 && n < 256);
  char tiny[40];
  CHECK(formatRow(r, tiny, sizeof(tiny)) == 0);
}

static std::vector<std::string> lines(const char* s) {
  std::vector<std::string> out;
  std::string cur;
  for (; *s; ++s) {
    if (*s == '\n') {
      out.push_back(cur);
      cur.clear();
    } else {
      cur += *s;
    }
  }
  if (!cur.empty()) out.push_back(cur);
  return out;
}

static bool hasLine(const std::vector<std::string>& ls, const std::string& l) {
  for (auto& x : ls)
    if (x == l) return true;
  return false;
}

TEST(csv_metadata_header) {
  Config c;
  setDefaults(c);
  strcpy(c.boat, "IOM GBR 123");
  c.has_declination = true;
  c.declination_deg = -1.2f;
  HeaderInfo h{};
  h.cfg = &c;
  h.logger = "esp32s3-bno085-m10 fw 1.0.0";
  h.board = "xiao_esp32s3";
  h.file_name = "LOG0001.CSV";
  char buf[2048];
  size_t n = formatHeader(h, buf, sizeof(buf));
  CHECK(n > 0);
  auto ls = lines(buf);
  CHECK_STR(ls.front(), "# format=sail-log v1");
  CHECK_STR(ls.back(), kCsvHeader);
  CHECK(hasLine(ls, "# logger=esp32s3-bno085-m10 fw 1.0.0"));
  CHECK(hasLine(ls, "# boat=IOM GBR 123"));
  CHECK(hasLine(ls, "# class=IOM"));
  CHECK(hasLine(ls, "# rate_hz=50"));
  CHECK(hasLine(ls, "# declination_deg=-1.2"));
  CHECK(hasLine(ls, "# imu_mount=x_fwd_y_port_z_up"));
  CHECK(hasLine(ls, "# rudder_center_us=1500"));
  CHECK(hasLine(ls, "# rudder_deg_per_us=0.09"));
  CHECK(hasLine(ls, "# sheet_in_us=1100"));
  CHECK(hasLine(ls, "# sheet_out_us=1900"));
  CHECK(hasLine(ls, "# tws_source=none"));
  CHECK(hasLine(ls, "# yaw_ref=true"));
  for (size_t i = 0; i + 1 < ls.size(); ++i) {
    CHECK(ls[i].rfind("# ", 0) == 0);
    CHECK(ls[i].find('=') != std::string::npos);
  }
  // No start_utc until known; appears once known.
  bool found = false;
  for (auto& l : ls) found |= l.rfind("# start_utc=", 0) == 0;
  CHECK(!found);
  h.has_start_utc = true;
  h.start_utc_ms = 1790244902000LL;
  formatHeader(h, buf, sizeof(buf));
  CHECK(hasLine(lines(buf), "# start_utc=2026-09-24T10:15:02Z"));
  // Declination unset -> no key, magnetic yaw.
  c.has_declination = false;
  c.ch_enable[kAux1] = true;
  strcpy(c.aux1_name, "jib");
  formatHeader(h, buf, sizeof(buf));
  ls = lines(buf);
  for (auto& l : ls) CHECK(l.rfind("# declination_deg", 0) != 0);
  CHECK(hasLine(ls, "# yaw_ref=magnetic"));
  CHECK(hasLine(ls, "# aux1_name=jib"));
}

TEST(csv_trailer_never_shrinks) {
  TrailerInfo t{};
  char buf[256];
  size_t prev = 0;
  for (uint32_t i = 0; i < 200000; i = i * 3 + 1) {
    t.rows = i;
    t.dropped_rows = i / 1000;
    t.end_t_ms = i * 20;
    if (i > 50) {
      t.has_start_utc = true;
      t.start_utc_ms = 1790244902000LL;
    }
    if (i > 5000) t.level_captures = 1;
    size_t n = formatTrailer(t, buf, sizeof(buf));
    CHECK(n >= prev);
    prev = n;
  }
  auto ls = lines(buf);
  CHECK(hasLine(ls, "# start_utc=2026-09-24T10:15:02Z"));
  for (auto& l : ls) CHECK(l.rfind("# ", 0) == 0 && l.find('=') != std::string::npos);
}

// Simulates the SD writer on an in-memory "file": header, then blocks of rows
// each followed by a trailer that the next block overwrites in place.
TEST(file_layout_with_rewritten_trailer) {
  Config c;
  setDefaults(c);
  HeaderInfo h{};
  h.cfg = &c;
  h.logger = "esp32s3-bno085-m10 fw 1.0.0";
  std::string file;
  char buf[2048];
  size_t n = formatHeader(h, buf, sizeof(buf));
  file.assign(buf, n);
  size_t data_end = file.size();
  auto writeAt = [&](size_t pos, const std::string& s) {
    if (file.size() < pos + s.size()) file.resize(pos + s.size());
    file.replace(pos, s.size(), s);
  };
  uint32_t rows = 0;
  for (int block = 0; block < 40; ++block) {
    std::string data;
    int nrows = block % 7;  // includes empty blocks
    for (int k = 0; k < nrows; ++k) {
      LogRow r;
      clearRow(r);
      r.t_ms = rows * 20;
      r.roll = 5.0 * std::sin(rows * 0.1);
      char row[kMaxRowLen];
      data.append(row, formatRow(r, row, sizeof(row)));
      rows++;
    }
    if (data.empty()) continue;  // the firmware only writes when rows are queued
    writeAt(data_end, data);
    data_end += data.size();
    TrailerInfo t{};
    t.rows = rows;
    t.dropped_rows = static_cast<uint32_t>(block / 10);
    t.end_t_ms = rows * 20;
    t.has_start_utc = block > 20;
    t.start_utc_ms = 1790244902000LL;
    char tb[256];
    writeAt(data_end, std::string(tb, formatTrailer(t, tb, sizeof(tb))));
  }
  auto ls = lines(file.c_str());
  size_t i = 0;
  while (i < ls.size() && ls[i].rfind("# ", 0) == 0) ++i;
  CHECK_STR(ls[i], kCsvHeader);
  ++i;
  uint32_t data_rows = 0;
  while (i < ls.size() && ls[i][0] != '#') {
    int commas = 0;
    for (char ch : ls[i]) commas += ch == ',';
    CHECK(commas == kNumColumns - 1);
    ++data_rows;
    ++i;
  }
  CHECK(data_rows == rows);
  std::vector<std::string> trailer(ls.begin() + static_cast<long>(i), ls.end());
  CHECK(trailer.size() == 4);
  CHECK(hasLine(trailer, "# rows=" + std::to_string(rows)));
  CHECK(hasLine(trailer, "# start_utc=2026-09-24T10:15:02Z"));
  CHECK(file.back() == '\n');
}

TEST(log_file_names) {
  char b[16];
  CHECK(logFileName(1, b));
  CHECK_STR(b, "LOG0001.CSV");
  CHECK(logFileName(9999, b));
  CHECK_STR(b, "LOG9999.CSV");
  CHECK(!logFileName(0, b));
  CHECK(!logFileName(10000, b));
  CHECK(logFileNumber("LOG0042.CSV") == 42);
  CHECK(logFileNumber("/log0042.csv") == 42);
  CHECK(logFileNumber("LOG42.CSV") == 0);
  CHECK(logFileNumber("LOGABCD.CSV") == 0);
  CHECK(logFileNumber("CONFIG.TXT") == 0);
}

// ================================================================== attitude
// Builds the BNO08x quaternion (sensor -> ENU) for a boat attitude and mount.
static Quat sensorQuat(double yaw, double pitch, double roll, const double Rbs[3][3],
                       double tilt_roll = 0, double tilt_pitch = 0) {
  Mat3 R_nb = rotZ(yaw) * rotY(pitch) * rotX(roll);
  Mat3 T = rotY(tilt_pitch) * rotX(tilt_roll);  // sensor board tilted on the hull
  Mat3 Rbs_m;
  for (int i = 0; i < 3; ++i)
    for (int j = 0; j < 3; ++j) Rbs_m.m[i][j] = Rbs[i][j];
  Mat3 P{};
  P.m[0][1] = P.m[1][0] = 1;
  P.m[2][2] = -1;
  Mat3 R_enu_s = P * R_nb * T * Rbs_m;
  return matToQuat(R_enu_s);
}

static double angDiff(double a, double b) {
  double d = std::fmod(a - b + 540.0, 360.0) - 180.0;
  return std::fabs(d);
}

TEST(mount_parsing) {
  double R[3][3];
  CHECK(parseMount("x_fwd_y_stbd_z_down", R));
  CHECK(R[0][0] == 1 && R[1][1] == 1 && R[2][2] == 1);
  CHECK(parseMount("x_fwd_y_port_z_up", R));
  CHECK(R[0][0] == 1 && R[1][1] == -1 && R[2][2] == -1);
  CHECK(parseMount("x_aft_y_stbd_z_up", R));
  CHECK(parseMount("x_stbd_y_aft_z_down", R));
  CHECK(parseMount("x_up_y_port_z_aft", R));
  CHECK(!parseMount("x_fwd_y_stbd_z_up", R));  // left-handed
  CHECK(!parseMount("x_up_y_port_z_fwd", R));  // left-handed
  CHECK(!parseMount("x_fwd_y_fwd_z_down", R));  // repeated axis
  CHECK(!parseMount("x_fwd_y_stbd", R));
  CHECK(!parseMount("y_fwd_x_stbd_z_down", R));
  CHECK(!parseMount("x_forward_y_stbd_z_down", R));
  CHECK(!parseMount("", R));
}

TEST(attitude_physical_cases) {
  double R[3][3];
  parseMount("x_fwd_y_port_z_up", R);  // chip flat, component side up
  AttitudeSolver s;
  s.setMount(R);
  // Sensor flat, x axis pointing north: the ENU quaternion is +90 deg about up.
  const double h = std::sqrt(0.5);
  Euler e = s.solve(Quat{h, 0, 0, h});
  CHECK_NEAR(e.yaw, 0.0, 1e-9);
  CHECK_NEAR(e.roll, 0.0, 1e-9);
  CHECK_NEAR(e.pitch, 0.0, 1e-9);
  // Sensor flat, x axis pointing east: identity quaternion -> heading 090.
  e = s.solve(Quat{1, 0, 0, 0});
  CHECK_NEAR(e.yaw, 90.0, 1e-9);
  // Accelerometer at rest (specific force, +g up in ENU), heeled 10 deg to
  // starboard: body reads ay = -g sin(roll), az = -g cos(roll).
  const double g = 9.80665;
  Quat q = sensorQuat(0, 0, 10, R);
  e = s.solve(q);
  CHECK_NEAR(e.roll, 10.0, 1e-9);
  Mat3 R_enu_s = quatToMat(q);
  Vec3 f_s = R_enu_s.transposed() * Vec3{0, 0, g};
  Vec3 f_b = s.toBody(f_s);
  CHECK_NEAR(f_b.x, 0.0, 1e-9);
  CHECK_NEAR(f_b.y, -g * std::sin(10 * M_PI / 180), 1e-9);
  CHECK_NEAR(f_b.z, -g * std::cos(10 * M_PI / 180), 1e-9);
  // Level at rest: az = -9.81 as the spec says.
  f_b = s.toBody(quatToMat(Quat{h, 0, 0, h}).transposed() * Vec3{0, 0, g});
  CHECK_NEAR(f_b.z, -g, 1e-9);
  // Bow up 5 deg: pitch +5.
  e = s.solve(sensorQuat(123, 5, 0, R));
  CHECK_NEAR(e.pitch, 5.0, 1e-9);
  CHECK_NEAR(e.yaw, 123.0, 1e-9);
  // Turning to starboard (clockwise from above): sensor z-up gyro reads
  // negative, body gz (z down) is positive.
  Vec3 w_b = s.toBody(Vec3{0, 0, -0.3});
  CHECK_NEAR(w_b.z, 0.3, 1e-12);
}

TEST(attitude_round_trip_many_mounts) {
  const char* mounts[] = {"x_fwd_y_stbd_z_down", "x_fwd_y_port_z_up", "x_aft_y_stbd_z_up",
                          "x_stbd_y_aft_z_down", "x_port_y_fwd_z_down", "x_up_y_port_z_aft",
                          "x_down_y_stbd_z_aft"};
  int cases = 0;
  for (const char* m : mounts) {
    double R[3][3];
    CHECK(parseMount(m, R));
    AttitudeSolver s;
    s.setMount(R);
    for (double yaw = 0; yaw < 360; yaw += 47)
      for (double pitch = -60; pitch <= 60; pitch += 30)
        for (double roll = -150; roll <= 150; roll += 25) {
          Euler e = s.solve(sensorQuat(yaw, pitch, roll, R));
          bool ok = angDiff(e.yaw, yaw) < 1e-6 && std::fabs(e.pitch - pitch) < 1e-6 &&
                    angDiff(e.roll, roll) < 1e-6;
          if (!ok)
            std::printf("  mount %s yaw %g pitch %g roll %g -> %g %g %g\n", m, yaw, pitch, roll,
                        e.yaw, e.pitch, e.roll);
          CHECK(ok);
          ++cases;
        }
  }
  CHECK(cases > 1000);
}

TEST(attitude_level_offset_trim_declination) {
  double R[3][3];
  parseMount("x_fwd_y_port_z_up", R);
  AttitudeSolver s;
  s.setMount(R);
  // Sensor board sits 3 deg rolled and 2 deg nose-down on a level hull.
  Quat q_level = sensorQuat(30, 0, 0, R, 3.0, -2.0);
  double r0, p0;
  s.rawTilt(q_level, r0, p0);
  CHECK_NEAR(r0, 3.0, 1e-9);
  CHECK_NEAR(p0, -2.0, 1e-9);
  s.setLevel(r0, p0);
  Euler e = s.solve(q_level);
  CHECK_NEAR(e.roll, 0.0, 1e-9);
  CHECK_NEAR(e.pitch, 0.0, 1e-9);
  CHECK_NEAR(e.yaw, 30.0, 1e-9);
  // Heeled 15 deg to starboard and 4 deg bow up after levelling.
  e = s.solve(sensorQuat(200, 4, 15, R, 3.0, -2.0));
  CHECK_NEAR(e.roll, 15.0, 1e-9);
  CHECK_NEAR(e.pitch, 4.0, 1e-9);
  CHECK_NEAR(e.yaw, 200.0, 1e-9);
  // Gravity on the levelled, upright hull lands on body z only.
  Mat3 Rq = quatToMat(q_level);
  Vec3 f_b = s.toBody(Rq.transposed() * Vec3{0, 0, 9.81});
  CHECK_NEAR(f_b.x, 0.0, 1e-9);
  CHECK_NEAR(f_b.y, 0.0, 1e-9);
  CHECK_NEAR(f_b.z, -9.81, 1e-9);
  // Yaw trim and declination, with wrap-around.
  s.setLevel(0, 0);
  s.setYawTrim(5);
  e = s.solve(sensorQuat(358, 0, 0, R));
  CHECK_NEAR(e.yaw, 3.0, 1e-9);
  s.setYawTrim(0);
  s.setDeclination(true, -1.2);
  e = s.solve(sensorQuat(0.5, 0, 0, R));
  CHECK_NEAR(e.yaw, 359.3, 1e-9);
  CHECK_NEAR(wrap360(-0.0), 0.0, 0);
  CHECK_NEAR(wrap360(720.5), 0.5, 1e-12);
}

// ===================================================================== pulse
TEST(edge_timer) {
  EdgeTimer et;
  CHECK(et.onEdge(false, 100) == 0);  // falling without rising
  CHECK(et.onEdge(true, 1000) == 0);
  CHECK(et.onEdge(false, 2500) == 1500);
  CHECK(et.onEdge(false, 2600) == 0);  // duplicate falling edge
  CHECK(et.onEdge(true, 10000) == 0);
  CHECK(et.onEdge(false, 15000) == 0);  // 5 ms: not a servo pulse
  // Across the 32-bit wrap.
  CHECK(et.onEdge(true, 0xFFFFFF00u) == 0);
  CHECK(et.onEdge(false, 0x000004DCu) == 1500);
}

TEST(pulse_decoder_filtering_and_timeout) {
  PulseDecoder d;
  uint16_t v = 0;
  CHECK(!d.value(0, v));
  uint32_t t = 1000;
  d.feed(1500, t);
  CHECK(d.value(t, v) && v == 1500);
  for (int i = 0; i < 5; ++i) d.feed(1500, t += 20000);
  // One-frame spike is removed by the median filter.
  d.feed(2100, t += 20000);
  CHECK(d.value(t, v) && v == 1500);
  d.feed(1500, t += 20000);
  CHECK(d.value(t, v) && v == 1500);
  d.feed(1500, t += 20000);
  // A genuine step shows after two frames.
  d.feed(1700, t += 20000);
  CHECK(d.value(t, v) && v == 1500);
  d.feed(1700, t += 20000);
  CHECK(d.value(t, v) && v == 1700);
  // Out-of-range glitches are rejected and the last value held.
  d.feed(300, t += 20000);
  d.feed(2600, t += 5000);
  CHECK(d.rejected() == 2);
  CHECK(d.value(t, v) && v == 1700);
  // No valid pulse for >100 ms -> empty.
  CHECK(d.value(t - 25000 + 100000, v));
  CHECK(!d.value(t - 25000 + 100001, v));
  // Signal returns: fresh history, value immediately.
  t += 500000;
  d.feed(1200, t);
  CHECK(d.value(t, v) && v == 1200);
}

TEST(pulse_decoder_wraparound) {
  PulseDecoder d;
  uint16_t v;
  uint32_t t = 0xFFFFFFFFu - 30000;
  d.feed(1400, t);
  d.feed(1400, t += 20000);
  d.feed(1400, t += 20000);  // wraps
  CHECK(d.value(t + 50000, v) && v == 1400);
  CHECK(!d.value(t + 150000, v));
}

TEST(switch_event) {
  SwitchEvent s(1700, 100);
  CHECK(!s.update(true, 1900));  // high at start: not armed
  CHECK(!s.update(true, 1900));
  CHECK(!s.update(true, 1100));  // low -> armed
  CHECK(s.update(true, 1900));   // event
  CHECK(!s.update(true, 1900));
  CHECK(!s.update(true, 1650));  // inside hysteresis
  CHECK(!s.update(true, 1750));
  CHECK(!s.update(true, 1500));
  CHECK(s.update(true, 1800));
  CHECK(!s.update(false, 0));    // signal lost -> disarm
  CHECK(!s.update(true, 1900));
}

// ======================================================================= ubx
TEST(ubx_checksum_known_frames) {
  uint8_t out[32];
  const uint8_t rate[] = {0x64, 0x00, 0x01, 0x00, 0x01, 0x00};  // CFG-RATE 100 ms
  size_t n = ubxFrame(0x06, 0x08, rate, sizeof(rate), out, sizeof(out));
  const uint8_t expect[] = {0xB5, 0x62, 0x06, 0x08, 0x06, 0x00, 0x64,
                            0x00, 0x01, 0x00, 0x01, 0x00, 0x7A, 0x12};
  CHECK(n == sizeof(expect) && std::memcmp(out, expect, n) == 0);
  n = ubxFrame(0x0A, 0x04, nullptr, 0, out, sizeof(out));  // MON-VER poll
  const uint8_t monver[] = {0xB5, 0x62, 0x0A, 0x04, 0x00, 0x00, 0x0E, 0x34};
  CHECK(n == sizeof(monver) && std::memcmp(out, monver, n) == 0);
  CHECK(ubxFrame(0x06, 0x08, rate, sizeof(rate), out, 10) == 0);
}

static void put32(uint8_t* p, int32_t v) {
  for (int i = 0; i < 4; ++i) p[i] = static_cast<uint8_t>(static_cast<uint32_t>(v) >> (8 * i));
}

static std::vector<uint8_t> navPvtPayload() {
  std::vector<uint8_t> p(92, 0);
  put32(&p[0], 123456000);  // iTOW
  p[4] = 2026 & 0xFF;
  p[5] = 2026 >> 8;
  p[6] = 9;
  p[7] = 23;
  p[8] = 10;
  p[9] = 15;
  p[10] = 2;
  p[11] = 0x07;               // validDate | validTime | fullyResolved
  put32(&p[16], 20000000);    // nano: +20 ms
  p[20] = 3;                  // 3-D
  p[21] = 0x01;               // gnssFixOK
  p[23] = 17;
  put32(&p[24], -13123456);   // lon 1e-7
  put32(&p[28], 508123456);   // lat
  put32(&p[40], 1100);        // hAcc mm
  put32(&p[48], 855);         // velN mm/s
  put32(&p[52], 745);         // velE
  put32(&p[60], 1132);        // gSpeed mm/s
  put32(&p[64], 4120000);     // headMot 1e-5 deg
  put32(&p[68], 50);          // sAcc mm/s
  return p;
}

TEST(ubx_nav_pvt_decode) {
  auto p = navPvtPayload();
  NavPvt o;
  CHECK(parseNavPvt(p.data(), 92, o));
  CHECK(o.time_valid && o.time_resolved);
  CHECK(o.utc_ms == 1790158502020LL);
  CHECK(o.fix == 3 && o.fix_ok && o.num_sv == 17);
  CHECK_NEAR(o.lat_deg, 50.8123456, 1e-9);
  CHECK_NEAR(o.lon_deg, -1.3123456, 1e-9);
  CHECK_NEAR(o.sog_mps, 1.132, 1e-12);
  CHECK_NEAR(o.cog_deg, 41.2, 1e-9);
  CHECK_NEAR(o.sacc_mps, 0.05, 1e-12);
  CHECK_NEAR(o.hacc_m, 1.1, 1e-12);
  CHECK(!parseNavPvt(p.data(), 84, o));
  // Negative nano rounds toward the previous millisecond.
  p[10] = 3;
  put32(&p[16], -979999999);
  parseNavPvt(p.data(), 92, o);
  CHECK(o.utc_ms == 1790158502020LL);
  // headMot negative wraps to 0..360.
  put32(&p[64], -1000000);
  parseNavPvt(p.data(), 92, o);
  CHECK_NEAR(o.cog_deg, 350.0, 1e-9);
  // Fix mapping.
  p[21] = 0;
  parseNavPvt(p.data(), 92, o);
  CHECK(o.fix == 0);
  p[21] = 1;
  p[20] = 2;
  parseNavPvt(p.data(), 92, o);
  CHECK(o.fix == 2);
  p[20] = 5;  // time only
  parseNavPvt(p.data(), 92, o);
  CHECK(o.fix == 0);
  p[20] = 4;  // GNSS + dead reckoning
  parseNavPvt(p.data(), 92, o);
  CHECK(o.fix == 3);
  p[11] = 0x02;  // date not valid
  parseNavPvt(p.data(), 92, o);
  CHECK(!o.time_valid);
}

TEST(ubx_parser_stream) {
  auto p = navPvtPayload();
  uint8_t frame[128];
  size_t n = ubxFrame(0x01, 0x07, p.data(), 92, frame, sizeof(frame));
  CHECK(n == 100);
  UbxParser u;
  // Garbage (NMEA and stray sync bytes), then the frame split in two.
  const char* nmea = "$GNRMC,,V,,,,,,,,,,N*4D\r\n\xB5\xB5";
  int got = 0;
  for (const char* c = nmea; *c; ++c) got += u.feed(static_cast<uint8_t>(*c));
  for (size_t i = 0; i < n; ++i) got += u.feed(frame[i]);
  CHECK(got == 1);
  CHECK(u.cls() == 0x01 && u.id() == 0x07 && u.len() == 92);
  NavPvt o;
  CHECK(parseNavPvt(u.payload(), u.len(), o) && o.num_sv == 17);
  // Corrupt one payload byte: checksum error, no frame.
  frame[50] ^= 0x40;
  got = 0;
  for (size_t i = 0; i < n; ++i) got += u.feed(frame[i]);
  CHECK(got == 0 && u.errors() == 1);
  // Two good frames back to back.
  frame[50] ^= 0x40;
  got = 0;
  for (int k = 0; k < 2; ++k)
    for (size_t i = 0; i < n; ++i) got += u.feed(frame[i]);
  CHECK(got == 2 && u.frames() == 3);
}

// Finds `key` in a VALSET payload and returns its value (size from key).
static bool valsetGet(const uint8_t* pl, uint16_t len, uint32_t key, uint32_t& val) {
  uint16_t i = 4;
  while (i + 4 <= len) {
    uint32_t k = pl[i] | (pl[i + 1] << 8) | (pl[i + 2] << 16) | (static_cast<uint32_t>(pl[i + 3]) << 24);
    i += 4;
    int sz = ((k >> 28) & 7) == 3 ? 2 : ((k >> 28) & 7) == 4 ? 4 : 1;
    uint32_t v = 0;
    for (int b = 0; b < sz; ++b) v |= static_cast<uint32_t>(pl[i + b]) << (8 * b);
    i += sz;
    if (k == key) {
      val = v;
      return true;
    }
  }
  return false;
}

TEST(ubx_valset_builders) {
  uint8_t buf[300];
  size_t n = buildNavConfig(10, buf, sizeof(buf));
  CHECK(n > 8);
  UbxParser u;
  int got = 0;
  for (size_t i = 0; i < n; ++i) got += u.feed(buf[i]);
  CHECK(got == 1 && u.cls() == 0x06 && u.id() == 0x8A);
  const uint8_t* pl = u.payload();
  CHECK(pl[0] == 0 && pl[1] == ubx::kLayerRam);
  uint32_t v;
  CHECK(valsetGet(pl, u.len(), ubx::CFG_RATE_MEAS, v) && v == 100);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_RATE_NAV, v) && v == 1);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_NAVSPG_DYNMODEL, v) && v == 5);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_UART1OUTPROT_NMEA, v) && v == 0);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_UART1OUTPROT_UBX, v) && v == 1);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_MSGOUT_UBX_NAV_PVT_UART1, v) && v == 1);
  CHECK(!valsetGet(pl, u.len(), ubx::CFG_SIGNAL_BDS_ENA, v));
  // 25 Hz: 40 ms and a reduced constellation set.
  n = buildNavConfig(25, buf, sizeof(buf));
  got = 0;
  for (size_t i = 0; i < n; ++i) got += u.feed(buf[i]);
  CHECK(got == 1);
  pl = u.payload();
  CHECK(valsetGet(pl, u.len(), ubx::CFG_RATE_MEAS, v) && v == 40);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_SIGNAL_BDS_ENA, v) && v == 0);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_SIGNAL_GLO_ENA, v) && v == 0);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_SIGNAL_GAL_ENA, v) && v == 0);
  CHECK(valsetGet(pl, u.len(), ubx::CFG_SIGNAL_GPS_ENA, v) && v == 1);
  n = buildNavConfig(15, buf, sizeof(buf));
  got = 0;
  for (size_t i = 0; i < n; ++i) got += u.feed(buf[i]);
  CHECK(valsetGet(u.payload(), u.len(), ubx::CFG_RATE_MEAS, v) && v == 67);
  CHECK(valsetGet(u.payload(), u.len(), ubx::CFG_SIGNAL_GAL_ENA, v) && v == 1);
  // Baud rate: U4 little endian.
  n = buildBaudConfig(115200, buf, sizeof(buf));
  CHECK(n == 8 + 4 + 8);
  const uint8_t expectPl[] = {0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x52, 0x40, 0x00, 0xC2, 0x01, 0x00};
  CHECK(std::memcmp(buf + 6, expectPl, sizeof(expectPl)) == 0);
  // ACK recognition.
  const uint8_t ackPl[] = {0x06, 0x8A};
  bool acked = false;
  CHECK(isAckFor(0x05, 0x01, ackPl, 2, 0x06, 0x8A, acked) && acked);
  CHECK(isAckFor(0x05, 0x00, ackPl, 2, 0x06, 0x8A, acked) && !acked);
  CHECK(!isAckFor(0x05, 0x01, ackPl, 2, 0x06, 0x08, acked));
  CHECK(!isAckFor(0x01, 0x07, ackPl, 2, 0x06, 0x8A, acked));
}

// ===================================================================== sport
TEST(sport_phys_ids_have_parity_bits) {
  for (uint8_t id = 0; id < 28; ++id) {
    uint8_t b = sportPhysIdByte(id);
    CHECK((b & 0x1F) == id);
    int b0 = id & 1, b1 = (id >> 1) & 1, b2 = (id >> 2) & 1, b3 = (id >> 3) & 1, b4 = (id >> 4) & 1;
    uint8_t expect = static_cast<uint8_t>(id | ((b0 ^ b1 ^ b2) << 5) | ((b2 ^ b3 ^ b4) << 6) |
                                          ((b0 ^ b2 ^ b4) << 7));
    CHECK(b == expect);
  }
  CHECK(sportPhysIdByte(12) == 0xAC);
  CHECK(sportPhysIdByte(27) == 0x1B);
}

TEST(sport_crc_and_frames) {
  // Hand-computed: 0x10 0x30 0x08 0 0 0 0 -> sum 0x48 -> CRC 0xB7.
  const uint8_t raw[] = {0x10, 0x30, 0x08, 0, 0, 0, 0};
  CHECK(sportCrc(raw, 7) == 0xB7);
  uint8_t out[16];
  size_t n = sportBuildFrame(0x0830, 0, out);
  const uint8_t expect[] = {0x10, 0x30, 0x08, 0, 0, 0, 0, 0xB7};
  CHECK(n == 8 && std::memcmp(out, expect, 8) == 0);
  // Carry folding: a receiver sums all 8 bytes the same way and gets 0xFF.
  uint32_t values[] = {0, 1, 0xFFFFFFFFu, 0x7E7D7E7Du, 123456789u, 0x80000000u};
  uint16_t ids[] = {0x0210, 0x0830, 0x0840, 0x5100, 0x7E7D, 0x0800};
  for (uint16_t id : ids)
    for (uint32_t v : values) {
      n = sportBuildFrame(id, v, out);
      bool noStart = true;
      for (size_t i = 0; i < n; ++i) noStart &= out[i] != 0x7E;
      CHECK(noStart);
      uint16_t gid;
      uint32_t gv;
      CHECK(sportParseFrame(out, n, gid, gv) && gid == id && gv == v);
      uint8_t unst[8];
      size_t k = 0;
      for (size_t i = 0; i < n; ++i) unst[k++] = out[i] == 0x7D ? static_cast<uint8_t>(out[++i] ^ 0x20) : out[i];
      uint16_t s = 0;
      for (int i = 0; i < 8; ++i) {
        s = static_cast<uint16_t>(s + unst[i]);
        s = static_cast<uint16_t>(s + (s >> 8));
        s &= 0xFF;
      }
      CHECK(s == 0xFF);
    }
  // Stuffing example: value 0x7E -> 0x7D 0x5E.
  n = sportBuildFrame(0x5100, 0x7E, out);
  CHECK(n >= 9 && out[3] == 0x7D && out[4] == 0x5E);
  // Corrupted frame is rejected.
  n = sportBuildFrame(0x5100, 42, out);
  out[4] ^= 1;
  uint16_t gid;
  uint32_t gv;
  CHECK(!sportParseFrame(out, n, gid, gv));
}

TEST(sport_poll_detector) {
  SportPollDetector d(12);
  const uint8_t stream[] = {0x7E, 0x00, 0xAC, 0x7E, 0xA1, 0x7E, 0x7E, 0xAC, 0x10, 0xAC};
  int hits = 0, at = -1;
  for (int i = 0; i < 10; ++i)
    if (d.feed(stream[i])) {
      hits++;
      at = i;
    }
  CHECK(hits == 1 && at == 7);
}

TEST(sport_scheduler_and_encodings) {
  SportValues v;
  SportScheduler s;
  uint16_t id;
  uint32_t val;
  CHECK(!s.next(v, id, val));
  v.has_vbat = true;
  v.vbat = 5.02;
  for (int i = 0; i < 5; ++i) {
    CHECK(s.next(v, id, val));
    CHECK(id == sport::kVfas && val == 502);
  }
  v.has_fix = v.has_att = v.has_yaw = v.has_vmg = true;
  v.sog_mps = 2.0;
  v.cog_deg = 41.2;
  v.roll = -12.3;
  v.pitch = 1.5;
  v.yaw = 43.9;
  v.vmg_mps = 1.0;
  v.lat = 50.8123456;
  v.lon = -1.3123456;
  std::vector<uint16_t> seen;
  for (int i = 0; i < 8; ++i) {
    CHECK(s.next(v, id, val));
    if (id == sport::kGpsSpeed) CHECK(val == 3888);  // 2 m/s = 3.888 kn
    if (id == sport::kHeel) CHECK(static_cast<int32_t>(val) == -123);
    if (id == sport::kGpsCourse) CHECK(val == 4120);
    if (id == sport::kVmg) CHECK(val == 194);
    if (id == sport::kHeading) CHECK(val == 439);
    if (id == sport::kPitch) CHECK(val == 15);
    bool dup = false;
    for (auto x : seen) dup |= x == id;
    CHECK(!dup);
    seen.push_back(id);
  }
  CHECK(seen.size() == 8);
  CHECK(sportEncodeLatLon(50.8123456, false) == 30487407u);
  CHECK(sportEncodeLatLon(-1.3123456, true) == (787407u | 0xC0000000u));
  CHECK_NEAR(vmgToward(2.0, 45, 0), std::sqrt(2.0), 1e-12);
  CHECK_NEAR(vmgToward(2.0, 180, 0), -2.0, 1e-12);
}

// ==================================================================== config
TEST(config_defaults_round_trip) {
  Config a, b;
  setDefaults(a);
  setDefaults(b);
  ConfigParseResult r = parseConfig(b, kDefaultConfigText);
  CHECK(r.unknown == 0 && r.invalid == 0);
  CHECK(r.applied > 25);
  CHECK(std::memcmp(&a, &b, sizeof(Config)) == 0);
}

TEST(config_example_file_matches_firmware_default) {
  // hardware/logger/config.example.txt must stay identical to what the
  // firmware writes to a blank card.
  FILE* f = std::fopen("../config.example.txt", "rb");
  CHECK(f != nullptr);
  if (!f) return;
  std::string text;
  char b[512];
  size_t n;
  while ((n = std::fread(b, 1, sizeof(b), f)) > 0) text.append(b, n);
  std::fclose(f);
  CHECK_STR(text, kDefaultConfigText);
}

TEST(config_parsing) {
  Config c;
  setDefaults(c);
  const char* text =
      "# comment\r\n"
      "  boat =  Moth GBR #4242  \r\n"
      "class=moth\n"
      "rate_hz = 100\n"
      "declination_deg = -1.5\n"
      "imu_mount = x_fwd_y_stbd_z_down\n"
      "imu_fusion = game\n"
      "channels = rudder, aux1 ,aux2\n"
      "aux1_name = flap\n"
      "event_channel = aux2\n"
      "gnss_rate = 25\n"
      "sport_enable = yes\n"
      "sport_id = 27\n"
      "vmg_bearing_deg = 225\n"
      "rate_hz = 5000\n"            // invalid: kept at 100
      "imu_mount = x_fwd_y_stbd_z_up\n"  // invalid (left-handed)
      "wibble = 3\n"                // unknown
      "no equals sign\n"            // invalid
      "\n";
  ConfigParseResult r = parseConfig(c, text);
  CHECK(r.unknown == 1);
  CHECK(r.invalid == 3);
  CHECK(r.first_bad_line == 15);
  CHECK_STR(c.boat, "Moth GBR #4242");
  CHECK_STR(c.boat_class, "Moth");
  CHECK(c.rate_hz == 100);
  CHECK(c.has_declination && std::fabs(c.declination_deg + 1.5f) < 1e-6);
  CHECK_STR(c.imu_mount, "x_fwd_y_stbd_z_down");
  CHECK(c.imu_fusion == ImuFusion::GameRotationVector);
  CHECK(c.ch_enable[kRudder] && !c.ch_enable[kSheet] && c.ch_enable[kAux1] && c.ch_enable[kAux2]);
  CHECK_STR(c.aux1_name, "flap");
  CHECK(c.event_channel == kAux2);
  CHECK(c.gnss_rate_hz == 25);
  CHECK(c.sport_enable && c.sport_id == 27);
  CHECK(c.has_vmg_bearing && c.vmg_bearing_deg == 225);
  // Explicit "none" clears optional values.
  CHECK(parseConfigLine(c, "declination_deg = none") == 1 && !c.has_declination);
  CHECK(parseConfigLine(c, "channels = none") == 1 && !c.ch_enable[kRudder]);
  CHECK(parseConfigLine(c, "gnss_baud = 12345") == -2 && c.gnss_baud == 115200);
  CHECK(parseConfigLine(c, "class = dinghy") == -2);
  CHECK(parseConfigLine(c, "rate_hz = 30") == -2 && c.rate_hz == 100);
  CHECK(parseConfigLine(c, "rate_hz = 25") == 1 && c.rate_hz == 25);
  CHECK(parseConfigLine(c, "rudder_deg_per_us = -0.09") == 1 && c.rudder_deg_per_us < 0);
  CHECK(parseConfigLine(c, "   # indented comment") == 0);
}

// ================================================================== ringbuf
TEST(byte_ring_basic_and_wrap) {
  static uint8_t store[16];
  ByteRing r(store, sizeof(store));
  CHECK(r.push("abcdefghij", 10));
  CHECK(!r.push("0123456789", 10));  // all or nothing
  CHECK(r.used() == 10);
  const uint8_t* p;
  size_t n = r.peek(&p);
  CHECK(n == 10 && std::memcmp(p, "abcdefghij", 10) == 0);
  r.consume(8);
  CHECK(r.push("0123456789", 10));  // wraps
  n = r.peek(&p);
  CHECK(n == 8 && std::memcmp(p, "ij012345", 8) == 0);
  r.consume(n);
  n = r.peek(&p);
  CHECK(n == 4 && std::memcmp(p, "6789", 4) == 0);
  r.consume(n);
  CHECK(r.used() == 0 && r.freeSpace() == 16);
}

TEST(byte_ring_threaded_rows) {
  // Producer pushes numbered "rows" as fast as it can; consumer drains in
  // blocks and checks nothing is reordered, torn or duplicated.
  static uint8_t store[1 << 12];
  ByteRing r(store, sizeof(store));
  const int kRows = 200000;
  std::atomic<int> dropped{0};
  std::thread prod([&] {
    char row[32];
    for (int i = 0; i < kRows; ++i) {
      int len = std::snprintf(row, sizeof(row), "%d,%d\n", i, i * 7);
      if (!r.push(row, static_cast<size_t>(len))) dropped++;
    }
  });
  std::string acc;
  long last = -1;
  bool ordered = true;
  int received = 0;
  auto drain = [&] {
    const uint8_t* p;
    size_t n;
    while ((n = r.peek(&p)) > 0) {
      acc.append(reinterpret_cast<const char*>(p), n);
      r.consume(n);
    }
    size_t pos;
    while ((pos = acc.find('\n')) != std::string::npos) {
      long a = 0, b = 0;
      if (std::sscanf(acc.c_str(), "%ld,%ld", &a, &b) != 2 || b != a * 7 || a <= last) ordered = false;
      last = a;
      received++;
      acc.erase(0, pos + 1);
    }
  };
  while (true) {
    drain();
    if (!prod.joinable()) break;
    if (received + dropped >= kRows) break;
    std::this_thread::yield();
  }
  prod.join();
  drain();
  CHECK(ordered);
  CHECK(acc.empty());
  CHECK(received + dropped == kRows);
  CHECK(received > 0);
}

TEST(spsc_queue) {
  SpscQueue<uint32_t, 4> q;
  for (uint32_t i = 0; i < 4; ++i) CHECK(q.push(i));
  CHECK(!q.push(99));
  CHECK(q.overflows() == 1);
  uint32_t v;
  for (uint32_t i = 0; i < 4; ++i) CHECK(q.pop(v) && v == i);
  CHECK(!q.pop(v));
}

// ===================================================================== util
TEST(button_classification) {
  Button b;
  uint32_t t = 0;
  CHECK(b.update(false, t) == Press::None);
  // Bouncy short press.
  auto press = [&](uint32_t hold) {
    Press out = Press::None;
    for (int i = 0; i < 4; ++i) {
      out = b.update(i % 2 == 0, t += 2);  // bounce
      if (out != Press::None) return out;
    }
    for (uint32_t e = 0; e < hold; e += 5)
      if ((out = b.update(true, t += 5)) != Press::None) return out;
    for (int i = 0; i < 4; ++i)
      if ((out = b.update(i % 2 == 1, t += 2)) != Press::None) return out;
    for (int i = 0; i < 20; ++i)
      if ((out = b.update(false, t += 5)) != Press::None) return out;
    return out;
  };
  CHECK(press(200) == Press::Short);
  CHECK(press(3000) == Press::Long);
  CHECK(press(7000) == Press::VeryLong);
  CHECK(press(1500) == Press::None);  // between short and long: ignored
  // A 10 ms spike is not a press.
  b.update(true, t += 5);
  b.update(false, t += 10);
  Press p = Press::None;
  for (int i = 0; i < 20; ++i)
    if (b.update(false, t += 5) != Press::None) p = Press::Short;
  CHECK(p == Press::None);
  // Held at power-on: ignored until released.
  Button b2;
  CHECK(b2.update(true, 0) == Press::None);
  Press q = Press::None;
  for (uint32_t tt = 5; tt < 300; tt += 5) q = b2.update(true, tt) != Press::None ? Press::Short : q;
  for (uint32_t tt = 300; tt < 400; tt += 5) q = b2.update(false, tt) != Press::None ? Press::Short : q;
  CHECK(q == Press::None);
}

TEST(led_patterns) {
  CHECK(selectLedMode(true, false, false, false, false) == LedMode::Boot);
  CHECK(selectLedMode(false, false, true, true, true) == LedMode::SdError);
  CHECK(selectLedMode(false, true, false, true, true) == LedMode::Stopped);
  CHECK(selectLedMode(false, true, true, false, true) == LedMode::ImuError);
  CHECK(selectLedMode(false, true, true, true, false) == LedMode::NoFix);
  CHECK(selectLedMode(false, true, true, true, true) == LedMode::Logging);
  auto count = [](LedMode m) {  // rising edges in 2 s
    int n = 0;
    bool prev = ledOn(m, 1999);
    for (uint32_t t = 2000; t < 4000; ++t) {
      bool on = ledOn(m, t);
      n += on && !prev;
      prev = on;
    }
    return n;
  };
  CHECK(count(LedMode::Logging) == 1);
  CHECK(count(LedMode::NoFix) == 2);
  CHECK(count(LedMode::ImuError) == 3);
  CHECK(count(LedMode::SdError) == 10);
  CHECK(count(LedMode::Stopped) == 1);
  CHECK(ledOn(LedMode::Boot, 1234));
}

TEST(utc_clock) {
  UtcClock c(40);
  CHECK(!c.valid());
  c.onGnssTime(1790158502000LL, 10040);  // arrived 40 ms after the epoch
  CHECK(c.valid());
  CHECK(c.utcAt(10000) == 1790158502000LL);
  CHECK(c.utcAt(10020) == 1790158502020LL);
  // Jittery arrivals: offset slews at most 2 ms per update, stays monotonic.
  int64_t prev = c.utcAt(10020);
  uint32_t t = 10020;
  for (int i = 1; i < 50; ++i) {
    int jitter = (i % 3) * 7 - 7;
    c.onGnssTime(1790158502000LL + i * 100, static_cast<uint32_t>(10040 + i * 100 + jitter));
    for (int k = 0; k < 5; ++k) {
      t += 20;
      int64_t u = c.utcAt(t);
      CHECK(u > prev);
      prev = u;
    }
  }
  CHECK(std::llabs(c.utcAt(15000) - (1790158502000LL + 5000)) <= 8);
  // A big jump steps.
  c.onGnssTime(1790158600000LL, 20040);
  CHECK(c.steps() == 1 && c.utcAt(20000) == 1790158600000LL);
}

TEST(vbat_filter) {
  VbatFilter f(2.0f, 0.5f);
  CHECK(!f.valid());
  CHECK_NEAR(f.update(2000), 4.0, 1e-6);
  CHECK_NEAR(f.update(2100), 4.1, 1e-6);
}

int main() {
  int failedTests = 0;
  for (auto& t : registry()) {
    int before = failCount();
    t.fn();
    bool ok = failCount() == before;
    if (!ok) failedTests++;
    std::printf("%s %s\n", ok ? "PASS" : "FAIL", t.name);
  }
  std::printf("\n%zu tests, %d checks, %d failed checks, %d failed tests\n", registry().size(),
              checkCount(), failCount(), failedTests);
  return failCount() ? 1 : 0;
}
