#include "saillog_util.h"

namespace saillog {

Press Button::update(bool raw, uint32_t now) {
  if (!init_) {
    init_ = true;
    raw_ = stable_ = raw;
    raw_change_ms_ = now;
    press_ms_ = now;
    // A button held at power-on is ignored until it is released.
    ignore_ = raw;
    return Press::None;
  }
  if (raw != raw_) {
    raw_ = raw;
    raw_change_ms_ = now;
  }
  if (raw_ == stable_ || now - raw_change_ms_ < deb_) return Press::None;
  stable_ = raw_;
  if (stable_) {
    press_ms_ = raw_change_ms_;
    return Press::None;
  }
  if (ignore_) {
    ignore_ = false;
    return Press::None;
  }
  uint32_t held = raw_change_ms_ - press_ms_;
  if (held < short_max_) return Press::Short;
  if (held >= vlong_min_) return Press::VeryLong;
  if (held >= long_min_) return Press::Long;
  return Press::None;
}

LedMode selectLedMode(bool booting, bool sd_ok, bool logging, bool imu_ok, bool gnss_fix) {
  if (booting) return LedMode::Boot;
  if (!sd_ok) return LedMode::SdError;
  if (!logging) return LedMode::Stopped;
  if (!imu_ok) return LedMode::ImuError;
  if (!gnss_fix) return LedMode::NoFix;
  return LedMode::Logging;
}

static bool flashes(uint32_t t, int n) {
  // n flashes of 80 ms, 170 ms apart, at the start of each 2 s period.
  uint32_t p = t % 2000;
  for (int i = 0; i < n; ++i) {
    uint32_t s = static_cast<uint32_t>(i) * 250;
    if (p >= s && p < s + 80) return true;
  }
  return false;
}

bool ledOn(LedMode m, uint32_t t) {
  switch (m) {
    case LedMode::Boot:
      return true;
    case LedMode::SdError:
      return (t % 200) < 100;
    case LedMode::ImuError:
      return flashes(t, 3);
    case LedMode::Stopped:
      return (t % 2000) < 1000;
    case LedMode::NoFix:
      return flashes(t, 2);
    case LedMode::Logging:
      return flashes(t, 1);
  }
  return false;
}

void UtcClock::onGnssTime(int64_t utc_ms, uint32_t rx_t_ms) {
  int64_t off = utc_ms - (static_cast<int64_t>(rx_t_ms) - latency_);
  if (!valid_) {
    offset_ = off;
    valid_ = true;
    return;
  }
  int64_t err = off - offset_;
  if (err > 500 || err < -500) {
    offset_ = off;
    steps_++;
  } else if (err > 2) {
    offset_ += 2;
  } else if (err < -2) {
    offset_ -= 2;
  } else {
    offset_ = off;
  }
}

float VbatFilter::update(uint32_t adc_mv) {
  float v = adc_mv * 0.001f * scale_;
  if (!init_) {
    v_ = v;
    init_ = true;
  } else {
    v_ += alpha_ * (v - v_);
  }
  return v_;
}

}  // namespace saillog
