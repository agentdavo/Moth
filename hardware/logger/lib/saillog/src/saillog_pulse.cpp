#include "saillog_pulse.h"

namespace saillog {

static uint16_t median3(uint16_t a, uint16_t b, uint16_t c) {
  if (a > b) {
    uint16_t t = a;
    a = b;
    b = t;
  }
  if (b > c) b = c;
  return a > b ? a : b;
}

void PulseDecoder::feed(uint32_t w, uint32_t t_us) {
  if (w < lim_.min_us || w > lim_.max_us) {
    rejected_++;
    return;
  }
  // A long gap since the last valid pulse: start the filter afresh so stale
  // history cannot outvote the new value.
  if (seen_ && (t_us - last_us_) > lim_.timeout_us) n_ = 0;
  hist_[0] = hist_[1];
  hist_[1] = hist_[2];
  hist_[2] = static_cast<uint16_t>(w);
  if (n_ < 3) n_++;
  last_us_ = t_us;
  seen_ = true;
  accepted_++;
}

bool PulseDecoder::value(uint32_t now_us, uint16_t& out) const {
  if (!seen_ || n_ == 0) return false;
  if ((now_us - last_us_) > lim_.timeout_us) return false;
  if (n_ < 3) {
    out = hist_[2];
  } else {
    out = median3(hist_[0], hist_[1], hist_[2]);
  }
  return true;
}

bool SwitchEvent::update(bool valid, uint16_t w) {
  if (!valid) {
    high_ = false;
    armed_ = false;
    return false;
  }
  if (!high_ && w >= thr_) {
    high_ = true;
    if (armed_) return true;
    return false;
  }
  if (w + hyst_ <= thr_) {
    high_ = false;
    armed_ = true;
  }
  return false;
}

}  // namespace saillog
