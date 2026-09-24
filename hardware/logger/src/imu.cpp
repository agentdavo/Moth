// CEVA BNO085/BNO086 over I2C using the sensor's own fusion.
// Reports: rotation vector (or game rotation vector), calibrated gyro and
// accelerometer (with gravity), all at 100 Hz so the 50 Hz rows always have
// a fresh sample.
#include <Adafruit_BNO08x.h>
#include <Wire.h>

#include "app.h"

namespace app {

static Adafruit_BNO08x s_bno(PIN_IMU_RST);
static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
static ImuState s_state;
static volatile bool s_cal_start = false, s_cal_save = false;

static const uint32_t kReportUs = 10000;  // 100 Hz

static sh2_SensorId_t orientationReport() {
  return g_cfg.imu_fusion == saillog::ImuFusion::RotationVector ? SH2_ROTATION_VECTOR
                                                                : SH2_GAME_ROTATION_VECTOR;
}

static bool enableReports() {
  bool ok = s_bno.enableReport(orientationReport(), kReportUs);
  ok &= s_bno.enableReport(SH2_GYROSCOPE_CALIBRATED, kReportUs);
  ok &= s_bno.enableReport(SH2_ACCELEROMETER, kReportUs);
  return ok;
}

// Our own SH-2 sensor callback: one sh2_service() call may deliver several
// reports and each one is decoded here (the stock helper keeps only the last).
static void onSensorEvent(void*, sh2_SensorEvent_t* ev) {
  sh2_SensorValue_t v;
  if (sh2_decodeSensorEvent(&v, ev) != SH2_OK) return;
  uint32_t now = millis();
  portENTER_CRITICAL(&s_mux);
  switch (v.sensorId) {
    case SH2_ROTATION_VECTOR:
      s_state.q = saillog::Quat{v.un.rotationVector.real, v.un.rotationVector.i,
                                v.un.rotationVector.j, v.un.rotationVector.k};
      s_state.q_accuracy_rad = v.un.rotationVector.accuracy;
      s_state.mag_status = v.status & 0x03;
      s_state.has_q = true;
      s_state.last_q_ms = now;
      break;
    case SH2_GAME_ROTATION_VECTOR:
      s_state.q = saillog::Quat{v.un.gameRotationVector.real, v.un.gameRotationVector.i,
                                v.un.gameRotationVector.j, v.un.gameRotationVector.k};
      s_state.q_accuracy_rad = -1;
      s_state.has_q = true;
      s_state.last_q_ms = now;
      break;
    case SH2_GYROSCOPE_CALIBRATED:
      s_state.gyro = saillog::Vec3{v.un.gyroscope.x, v.un.gyroscope.y, v.un.gyroscope.z};
      s_state.has_gyro = true;
      break;
    case SH2_ACCELEROMETER:
      s_state.accel = saillog::Vec3{v.un.accelerometer.x, v.un.accelerometer.y, v.un.accelerometer.z};
      s_state.has_accel = true;
      break;
    default:
      break;
  }
  portEXIT_CRITICAL(&s_mux);
}

bool imuBegin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  bool ok = s_bno.begin_I2C(0x4A, &Wire) || s_bno.begin_I2C(0x4B, &Wire);
  if (!ok) return false;
  sh2_setSensorCallback(onSensorEvent, nullptr);
  enableReports();
  portENTER_CRITICAL(&s_mux);
  s_state.present = true;
  portEXIT_CRITICAL(&s_mux);
  return true;
}

void imuTask(void*) {
  for (;;) {
    if (s_bno.wasReset()) {
      enableReports();
      portENTER_CRITICAL(&s_mux);
      s_state.resets++;
      portEXIT_CRITICAL(&s_mux);
    }
    if (s_cal_start) {
      s_cal_start = false;
      sh2_setCalConfig(SH2_CAL_ACCEL | SH2_CAL_GYRO | SH2_CAL_MAG);
    }
    if (s_cal_save) {
      s_cal_save = false;
      sh2_saveDcdNow();
    }
    sh2_service();
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

bool imuGet(ImuState& out) {
  portENTER_CRITICAL(&s_mux);
  out = s_state;
  portEXIT_CRITICAL(&s_mux);
  return out.present && out.has_q && (millis() - out.last_q_ms) < 500;
}

void imuStartMagCal() { s_cal_start = true; }
void imuSaveCal() { s_cal_save = true; }

}  // namespace app
