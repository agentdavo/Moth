// Passive capture of receiver servo pulses.
//
// Each tapped signal line goes through a 10 kOhm series resistor to an input
// pin (high impedance, no pull-up/down), with the logger ground common with
// the receiver. The pin never drives the line, so the servo sees the same
// signal whether the logger is powered, unpowered or absent.
//
// A CHANGE interrupt timestamps both edges with the 1 us esp_timer; the ISR
// only computes the high time and queues it. The sampler task validates and
// filters (saillog::PulseDecoder: range check, median-of-3, 100 ms timeout).
#include <soc/gpio_reg.h>

#include "app.h"
#include "saillog_pulse.h"
#include "saillog_ringbuf.h"

namespace app {

namespace {

struct Sample {
  uint32_t width_us;
  uint32_t t_us;
};

struct Channel {
  int pin = -1;
  saillog::EdgeTimer edges;
  saillog::SpscQueue<Sample, 16> queue;
  saillog::PulseDecoder decoder;
};

Channel s_ch[4];

inline bool IRAM_ATTR readPin(int pin) {
  return pin < 32 ? (REG_READ(GPIO_IN_REG) >> pin) & 1U : (REG_READ(GPIO_IN1_REG) >> (pin - 32)) & 1U;
}

void IRAM_ATTR onEdge(void* arg) {
  Channel* c = static_cast<Channel*>(arg);
  uint32_t t = static_cast<uint32_t>(esp_timer_get_time());
  uint32_t w = c->edges.onEdge(readPin(c->pin), t);
  if (w) c->queue.push(Sample{w, t});
}

}  // namespace

void servoBegin() {
  const int pins[4] = {PIN_RUDDER, PIN_SHEET, PIN_AUX1, PIN_AUX2};
  saillog::PulseLimits lim;
  lim.min_us = g_cfg.pulse_min_us;
  lim.max_us = g_cfg.pulse_max_us;
  lim.timeout_us = 100000;
  for (int i = 0; i < 4; ++i) {
    s_ch[i].decoder.setLimits(lim);
    if (!g_cfg.ch_enable[i] || pins[i] < 0) continue;
    s_ch[i].pin = pins[i];
    pinMode(pins[i], INPUT);  // no pull: the receiver drives the line
    attachInterruptArg(digitalPinToInterrupt(pins[i]), onEdge, &s_ch[i], CHANGE);
  }
}

void servoPoll(uint32_t now_us, int32_t out_us[4]) {
  for (int i = 0; i < 4; ++i) {
    out_us[i] = 0;
    Channel& c = s_ch[i];
    if (c.pin < 0) continue;
    Sample s;
    while (c.queue.pop(s)) c.decoder.feed(s.width_us, s.t_us);
    uint16_t v;
    if (c.decoder.value(now_us, v)) out_us[i] = v;
  }
}

uint32_t servoRejected(int ch) { return (ch >= 0 && ch < 4) ? s_ch[ch].decoder.rejected() : 0; }

}  // namespace app
