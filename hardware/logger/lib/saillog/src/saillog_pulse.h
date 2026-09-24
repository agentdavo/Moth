// Passive RC servo pulse capture logic.
//
// EdgeTimer turns edge timestamps (from a GPIO interrupt) into high-time
// widths. PulseDecoder validates widths, removes single-frame spikes with a
// median-of-3 filter, holds the last good value and reports "no signal" once
// no valid pulse has arrived for the timeout (100 ms by default).
// All times are microseconds from a free-running 32-bit counter; wrap-around
// is handled by unsigned subtraction.
#pragma once

#include <stdint.h>

#ifndef SAILLOG_ALWAYS_INLINE
#if defined(__GNUC__)
#define SAILLOG_ALWAYS_INLINE inline __attribute__((always_inline))
#else
#define SAILLOG_ALWAYS_INLINE inline
#endif
#endif

namespace saillog {

struct EdgeTimer {
  uint32_t rise_us = 0;
  bool high = false;

  // Call on every edge with the pin level after the edge. Returns the pulse
  // width in us on a falling edge that follows a rising edge within 4 ms,
  // else 0. Safe to call from an ISR (no calls, no allocation).
  SAILLOG_ALWAYS_INLINE uint32_t onEdge(bool level, uint32_t t_us) {
    if (level) {
      rise_us = t_us;
      high = true;
      return 0;
    }
    if (!high) return 0;
    high = false;
    uint32_t w = t_us - rise_us;
    return (w > 0 && w < 4000) ? w : 0;
  }
};

struct PulseLimits {
  uint16_t min_us = 800;
  uint16_t max_us = 2200;
  uint32_t timeout_us = 100000;
};

class PulseDecoder {
 public:
  explicit PulseDecoder(const PulseLimits& lim = PulseLimits()) : lim_(lim) {}
  void setLimits(const PulseLimits& lim) { lim_ = lim; }

  // Feeds one measured width, taken at time t_us (the falling edge).
  void feed(uint32_t width_us, uint32_t t_us);

  // Filtered width if a valid pulse arrived within the timeout.
  bool value(uint32_t now_us, uint16_t& out) const;

  uint32_t accepted() const { return accepted_; }
  uint32_t rejected() const { return rejected_; }

 private:
  PulseLimits lim_;
  uint16_t hist_[3] = {0, 0, 0};
  uint8_t n_ = 0;  // valid samples in hist_ (saturates at 3)
  uint32_t last_us_ = 0;
  bool seen_ = false;
  uint32_t accepted_ = 0;
  uint32_t rejected_ = 0;
};

// Rising-edge detector with hysteresis for a transmitter switch on a spare
// channel: fires once each time the pulse goes above `threshold`, re-arms
// when it drops 100 us below it (or the signal is lost).
class SwitchEvent {
 public:
  explicit SwitchEvent(uint16_t threshold_us = 1700, uint16_t hysteresis_us = 100)
      : thr_(threshold_us), hyst_(hysteresis_us) {}
  bool update(bool valid, uint16_t width_us);

 private:
  uint16_t thr_, hyst_;
  bool armed_ = false;  // must see the switch low once before the first event
  bool high_ = false;
};

}  // namespace saillog
