// Orientation maths: BNO08x quaternion -> boat yaw/roll/pitch in the
// sail-log v1 conventions (docs/LOG_FORMAT.md):
//   body frame  x forward, y starboard, z down (FRD, right-handed)
//   roll  + = starboard side down
//   pitch + = bow up
//   yaw   0..360 clockwise from north (true when declination is applied)
//
// Input convention (BNO08x / Android rotation vector): the quaternion q
// rotates sensor-frame vectors into an East-North-Up world frame,
// v_enu = q * v_sensor * q^-1. The magnetometer-referenced rotation vector
// has its world y axis on magnetic north; the game rotation vector has an
// arbitrary yaw reference.
#pragma once

namespace saillog {

struct Vec3 {
  double x, y, z;
};

struct Quat {
  double w, x, y, z;
};

struct Euler {
  double yaw;    // deg, [0, 360)
  double roll;   // deg, (-180, 180]
  double pitch;  // deg, [-90, 90]
};

struct Mat3 {
  double m[3][3];
  static Mat3 identity();
  Mat3 operator*(const Mat3& o) const;
  Vec3 operator*(const Vec3& v) const;
  Mat3 transposed() const;
};

Mat3 quatToMat(const Quat& q);  // normalises q
Quat matToQuat(const Mat3& R);  // for tests and tools
Mat3 rotX(double deg);
Mat3 rotY(double deg);
Mat3 rotZ(double deg);

// ZYX (yaw, pitch, roll) Euler angles of a body-to-NED matrix.
Euler eulerFromBodyToNed(const Mat3& R_nb);

// Wraps an angle to [0, 360).
double wrap360(double deg);

class AttitudeSolver {
 public:
  AttitudeSolver();

  // v_body = R_bs * v_sensor (see saillog::parseMount).
  void setMount(const double R_bs[3][3]);
  void setYawTrim(double deg);
  void setDeclination(bool enabled, double deg);
  // Level offset: the tilt (roll, pitch) the sensor reported while the hull
  // was level. It is removed from attitude and from gyro/accel vectors.
  void setLevel(double roll0_deg, double pitch0_deg);
  double levelRoll() const { return level_roll_; }
  double levelPitch() const { return level_pitch_; }

  // Tilt of the mounted sensor with the current mount and yaw trim but
  // WITHOUT the level offset: feed a still, level hull to setLevel().
  void rawTilt(const Quat& q_enu, double& roll_deg, double& pitch_deg) const;

  // Full attitude of the boat.
  Euler solve(const Quat& q_enu) const;
  // Rotates a sensor-frame vector (gyro, accel) into the corrected body frame.
  Vec3 toBody(const Vec3& v_sensor) const;

 private:
  void rebuild();
  Mat3 R_sb0_;  // sensor-from-body with mount and trim (no level)
  Mat3 K_;      // sensor-from-body including level correction
  Mat3 Kt_;     // body-from-sensor including level correction
  Mat3 R_bs_;
  double yaw_trim_;
  bool decl_on_;
  double decl_;
  double level_roll_, level_pitch_;
};

}  // namespace saillog
