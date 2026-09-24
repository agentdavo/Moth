#include "saillog_fmt.h"

#include <math.h>

namespace saillog {

void TextWriter::put(char c) {
  if (!ok_) return;
  if (len_ + 1 >= cap_) {
    ok_ = false;
    return;
  }
  buf_[len_++] = c;
  buf_[len_] = '\0';
}

void TextWriter::str(const char* s) {
  if (!s) return;
  while (*s && ok_) put(*s++);
}

void TextWriter::u64(uint64_t v) {
  char tmp[21];
  int n = 0;
  do {
    tmp[n++] = static_cast<char>('0' + (v % 10));
    v /= 10;
  } while (v);
  while (n) put(tmp[--n]);
}

void TextWriter::i64(int64_t v) {
  if (v < 0) {
    put('-');
    u64(static_cast<uint64_t>(-(v + 1)) + 1);  // safe for INT64_MIN
  } else {
    u64(static_cast<uint64_t>(v));
  }
}

void TextWriter::fixed(double v, int decimals) {
  if (!isfinite(v)) return;
  if (decimals < 0) decimals = 0;
  if (decimals > 9) decimals = 9;
  uint64_t scale = 1;
  for (int i = 0; i < decimals; ++i) scale *= 10;
  double scaled = fabs(v) * static_cast<double>(scale);
  if (scaled > 9.0e15) return;  // out of range for exact integer maths
  uint64_t q = static_cast<uint64_t>(scaled + 0.5);
  if (v < 0 && q != 0) put('-');
  u64(q / scale);
  if (decimals) {
    put('.');
    uint64_t frac = q % scale;
    char tmp[10];
    for (int i = decimals - 1; i >= 0; --i) {
      tmp[i] = static_cast<char>('0' + frac % 10);
      frac /= 10;
    }
    for (int i = 0; i < decimals; ++i) put(tmp[i]);
  }
}

size_t formatFixed(char* out, size_t cap, double v, int decimals) {
  TextWriter w(out, cap);
  w.fixed(v, decimals);
  if (!w.ok()) {
    if (cap) out[0] = '\0';
    return 0;
  }
  return w.len();
}

int64_t daysFromCivil(int y, unsigned m, unsigned d) {
  y -= m <= 2;
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int64_t>(doe) - 719468;
}

void civilFromDays(int64_t z, int& y, unsigned& m, unsigned& d) {
  z += 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const int64_t yy = static_cast<int64_t>(yoe) + era * 400;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  d = doy - (153 * mp + 2) / 5 + 1;
  m = mp < 10 ? mp + 3 : mp - 9;
  y = static_cast<int>(yy + (m <= 2));
}

static void two(TextWriter& w, unsigned v) {
  w.put(static_cast<char>('0' + (v / 10) % 10));
  w.put(static_cast<char>('0' + v % 10));
}

size_t formatIsoUtc(char* out, size_t cap, int64_t epoch_ms) {
  int64_t secs = epoch_ms >= 0 ? epoch_ms / 1000 : -((-epoch_ms + 999) / 1000);
  int64_t days = secs >= 0 ? secs / 86400 : -((-secs + 86399) / 86400);
  int64_t sod = secs - days * 86400;
  int y;
  unsigned m, d;
  civilFromDays(days, y, m, d);
  TextWriter w(out, cap);
  w.i64(y);
  w.put('-');
  two(w, m);
  w.put('-');
  two(w, d);
  w.put('T');
  two(w, static_cast<unsigned>(sod / 3600));
  w.put(':');
  two(w, static_cast<unsigned>((sod / 60) % 60));
  w.put(':');
  two(w, static_cast<unsigned>(sod % 60));
  w.put('Z');
  if (!w.ok()) {
    if (cap) out[0] = '\0';
    return 0;
  }
  return w.len();
}

}  // namespace saillog
