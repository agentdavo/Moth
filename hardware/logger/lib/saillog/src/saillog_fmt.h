// Small allocation-free text helpers shared by the CSV, header and config code.
// Pure C++ (no Arduino), unit tested on the host in test_host/.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace saillog {

// Appends text into a fixed buffer. Once anything fails to fit, ok() stays
// false and the buffer is left NUL terminated at the last good position.
class TextWriter {
 public:
  TextWriter(char* buf, size_t cap) : buf_(buf), cap_(cap), len_(0), ok_(cap > 0) {
    if (cap_) buf_[0] = '\0';
  }
  void put(char c);
  void str(const char* s);
  void u64(uint64_t v);
  void i64(int64_t v);
  // Fixed-point decimal with `decimals` digits after the point, rounded half
  // away from zero. Never prints "-0.00". Non-finite values print nothing.
  void fixed(double v, int decimals);
  size_t len() const { return len_; }
  bool ok() const { return ok_; }
  const char* c_str() const { return buf_; }

 private:
  char* buf_;
  size_t cap_;
  size_t len_;
  bool ok_;
};

// Formats `v` into out (NUL terminated). Returns characters written (0 if the
// value is not finite or does not fit).
size_t formatFixed(char* out, size_t cap, double v, int decimals);

// Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant's algorithm).
int64_t daysFromCivil(int y, unsigned m, unsigned d);
void civilFromDays(int64_t z, int& y, unsigned& m, unsigned& d);

// "2026-09-24T10:15:02Z" (whole seconds, truncated). Needs cap >= 21.
size_t formatIsoUtc(char* out, size_t cap, int64_t epoch_ms);

}  // namespace saillog
