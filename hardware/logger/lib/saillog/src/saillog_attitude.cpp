#include "saillog_attitude.h"

#include <math.h>

namespace saillog {

static const double kPi = 3.14159265358979323846;
static const double kDeg = 180.0 / kPi;
static const double kRad = kPi / 180.0;

Mat3 Mat3::identity() {
  Mat3 r{};
  r.m[0][0] = r.m[1][1] = r.m[2][2] = 1;
  return r;
}

Mat3 Mat3::operator*(const Mat3& o) const {
  Mat3 r{};
  for (int i = 0; i < 3; ++i)
    for (int j = 0; j < 3; ++j)
      r.m[i][j] = m[i][0] * o.m[0][j] + m[i][1] * o.m[1][j] + m[i][2] * o.m[2][j];
  return r;
}

Vec3 Mat3::operator*(const Vec3& v) const {
  return Vec3{m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
              m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
              m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z};
}

Mat3 Mat3::transposed() const {
  Mat3 r{};
  for (int i = 0; i < 3; ++i)
    for (int j = 0; j < 3; ++j) r.m[i][j] = m[j][i];
  return r;
}

Mat3 quatToMat(const Quat& q_in) {
  double n = sqrt(q_in.w * q_in.w + q_in.x * q_in.x + q_in.y * q_in.y + q_in.z * q_in.z);
  Quat q = n > 1e-9 ? Quat{q_in.w / n, q_in.x / n, q_in.y / n, q_in.z / n} : Quat{1, 0, 0, 0};
  const double w = q.w, x = q.x, y = q.y, z = q.z;
  Mat3 R{};
  R.m[0][0] = 1 - 2 * (y * y + z * z);
  R.m[0][1] = 2 * (x * y - w * z);
  R.m[0][2] = 2 * (x * z + w * y);
  R.m[1][0] = 2 * (x * y + w * z);
  R.m[1][1] = 1 - 2 * (x * x + z * z);
  R.m[1][2] = 2 * (y * z - w * x);
  R.m[2][0] = 2 * (x * z - w * y);
  R.m[2][1] = 2 * (y * z + w * x);
  R.m[2][2] = 1 - 2 * (x * x + y * y);
  return R;
}

Quat matToQuat(const Mat3& R) {
  const double (*m)[3] = R.m;
  double tr = m[0][0] + m[1][1] + m[2][2];
  Quat q;
  if (tr > 0) {
    double s = sqrt(tr + 1.0) * 2;
    q = Quat{0.25 * s, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s};
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    double s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2;
    q = Quat{(m[2][1] - m[1][2]) / s, 0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s};
  } else if (m[1][1] > m[2][2]) {
    double s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2;
    q = Quat{(m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s};
  } else {
    double s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2;
    q = Quat{(m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s};
  }
  return q;
}

Mat3 rotX(double deg) {
  double c = cos(deg * kRad), s = sin(deg * kRad);
  Mat3 r = Mat3::identity();
  r.m[1][1] = c;
  r.m[1][2] = -s;
  r.m[2][1] = s;
  r.m[2][2] = c;
  return r;
}

Mat3 rotY(double deg) {
  double c = cos(deg * kRad), s = sin(deg * kRad);
  Mat3 r = Mat3::identity();
  r.m[0][0] = c;
  r.m[0][2] = s;
  r.m[2][0] = -s;
  r.m[2][2] = c;
  return r;
}

Mat3 rotZ(double deg) {
  double c = cos(deg * kRad), s = sin(deg * kRad);
  Mat3 r = Mat3::identity();
  r.m[0][0] = c;
  r.m[0][1] = -s;
  r.m[1][0] = s;
  r.m[1][1] = c;
  return r;
}

double wrap360(double deg) {
  double r = fmod(deg, 360.0);
  if (r < 0) r += 360.0;
  if (r >= 360.0) r -= 360.0;
  return r;
}

Euler eulerFromBodyToNed(const Mat3& R) {
  Euler e;
  double s = -R.m[2][0];
  if (s > 1) s = 1;
  if (s < -1) s = -1;
  e.pitch = asin(s) * kDeg;
  e.roll = atan2(R.m[2][1], R.m[2][2]) * kDeg;
  e.yaw = wrap360(atan2(R.m[1][0], R.m[0][0]) * kDeg);
  return e;
}

// ENU world -> NED world (a proper rotation: swaps x/y, flips z).
static Mat3 nedFromEnu() {
  Mat3 P{};
  P.m[0][1] = 1;
  P.m[1][0] = 1;
  P.m[2][2] = -1;
  return P;
}

AttitudeSolver::AttitudeSolver()
    : yaw_trim_(0), decl_on_(false), decl_(0), level_roll_(0), level_pitch_(0) {
  R_bs_ = Mat3::identity();
  rebuild();
}

void AttitudeSolver::setMount(const double R_bs[3][3]) {
  for (int i = 0; i < 3; ++i)
    for (int j = 0; j < 3; ++j) R_bs_.m[i][j] = R_bs[i][j];
  rebuild();
}

void AttitudeSolver::setYawTrim(double deg) {
  yaw_trim_ = deg;
  rebuild();
}

void AttitudeSolver::setDeclination(bool enabled, double deg) {
  decl_on_ = enabled;
  decl_ = deg;
}

void AttitudeSolver::setLevel(double roll0, double pitch0) {
  level_roll_ = roll0;
  level_pitch_ = pitch0;
  rebuild();
}

void AttitudeSolver::rebuild() {
  // R_nb = R_ns * R_sb. With the mount alone R_sb = R_bs^T; the yaw trim
  // turns the body about its z axis; the level offset T = Ry(p0) Rx(r0) is
  // the tilt of the mounted sensor on a level hull, removed on the right.
  R_sb0_ = R_bs_.transposed() * rotZ(yaw_trim_);
  Mat3 T = rotY(level_pitch_) * rotX(level_roll_);
  K_ = R_sb0_ * T.transposed();
  Kt_ = K_.transposed();
}

void AttitudeSolver::rawTilt(const Quat& q, double& roll, double& pitch) const {
  Euler e = eulerFromBodyToNed(nedFromEnu() * quatToMat(q) * R_sb0_);
  roll = e.roll;
  pitch = e.pitch;
}

Euler AttitudeSolver::solve(const Quat& q) const {
  Euler e = eulerFromBodyToNed(nedFromEnu() * quatToMat(q) * K_);
  if (decl_on_) e.yaw = wrap360(e.yaw + decl_);
  return e;
}

Vec3 AttitudeSolver::toBody(const Vec3& v) const { return Kt_ * v; }

}  // namespace saillog
