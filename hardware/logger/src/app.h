// Firmware-wide shared state and module interfaces.
//
// Task layout (ESP32-S3, two cores):
//   core 1  sampler  (prio 6)  fixed-rate rows: snapshot -> attitude -> CSV -> ring
//   core 1  imu      (prio 5)  services the BNO08x over I2C
//   core 1  gnss     (prio 4)  UBX parser on UART1
//   core 0  sd       (prio 3)  drains the ring to the card in 4-16 KB blocks
//   core 0  sport    (prio 4)  FrSky S.Port responder (optional)
//   core 1  loop()   (prio 1)  button, LED, battery, USB console
// Shared structs are copied under a spinlock; the row ring is lock-free SPSC.
#pragma once

#include <Arduino.h>

#include "board.h"
#include "saillog_attitude.h"
#include "saillog_config.h"
#include "saillog_ubx.h"

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif
#define LOGGER_ID "esp32s3-bno085-m10 fw " FW_VERSION

namespace app {

extern saillog::Config g_cfg;

// ------------------------------------------------------------------ IMU --
struct ImuState {
  bool present = false;       // answered at start-up
  uint32_t last_q_ms = 0;     // millis() of the last orientation report
  bool has_q = false;
  saillog::Quat q{1, 0, 0, 0};  // sensor -> ENU (BNO08x convention)
  float q_accuracy_rad = -1;  // heading accuracy estimate (rotation vector only)
  bool has_gyro = false;
  saillog::Vec3 gyro{0, 0, 0};   // rad/s, sensor frame
  bool has_accel = false;
  saillog::Vec3 accel{0, 0, 0};  // m/s^2, sensor frame, includes gravity
  uint8_t mag_status = 0;     // 0 unreliable .. 3 high
  uint32_t resets = 0;
};

bool imuBegin();
void imuTask(void*);
bool imuGet(ImuState& out);  // false if the IMU is absent or silent > 500 ms
void imuStartMagCal();       // enable accel/gyro/mag dynamic calibration
void imuSaveCal();           // save the calibration (DCD) to the sensor's flash

// ----------------------------------------------------------------- GNSS --
struct GnssState {
  bool alive = false;         // any valid UBX frame in the last 2 s
  bool configured = false;    // VALSET acknowledged
  uint32_t seq = 0;           // increments per NAV-PVT
  uint32_t rx_ms = 0;         // millis() when the last NAV-PVT arrived
  saillog::NavPvt pvt{};
  uint32_t frames = 0, errors = 0;
};

void gnssBegin();
void gnssTask(void*);
void gnssGet(GnssState& out);
bool utcNow(uint32_t t_ms, int64_t& utc_ms);    // GNSS-disciplined UTC for t_ms
bool firstFixUtc(int64_t& utc_ms);              // UTC of the first 2-D/3-D fix

// ---------------------------------------------------------------- servos --
void servoBegin();
// Latest filtered pulse widths (0 = no signal / disabled). Call from the sampler.
void servoPoll(uint32_t now_us, int32_t out_us[4]);
uint32_t servoRejected(int ch);

// -------------------------------------------------------------- SD card --
bool sdBegin();                  // mount the card, read /config.txt and /level.txt
bool sdCardOk();
bool sdStartFile();              // new LOGnnnn.CSV with header
void sdRequestStop();            // write trailer, close
void sdRequestStart();           // open the next LOGnnnn.CSV (from the writer task)
bool sdLogging();
const char* sdFileName();
void sdTask(void*);
bool sdPushRow(const char* row, size_t n);  // from the sampler; false = dropped
void sdNoteDropped();                       // sampler overrun
void sdNoteLevelCapture(double roll0, double pitch0);  // persist to /level.txt
bool sdLoadedLevel(double& roll0, double& pitch0);
uint32_t sdRows();
uint32_t sdDropped();
size_t sdBufferUsed();

// ---------------------------------------------------------------- S.Port --
void sportBegin();
void sportTask(void*);

// ---------------------------------------------------------- misc / main --
struct Telemetry {  // latest values for S.Port and the console
  bool has_fix;
  double lat, lon, sog, cog;
  bool has_att, has_yaw;
  double roll, pitch, yaw;
  float vbat;
};
void telemetryGet(Telemetry& t);
void telemetrySet(const Telemetry& t);

float vbatVolts();
void requestLevelCapture();

}  // namespace app
