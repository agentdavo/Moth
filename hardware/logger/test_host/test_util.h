// Minimal test harness: TEST(name) { CHECK(...); } and a registry.
#pragma once

#include <cmath>
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

struct TestCase {
  const char* name;
  std::function<void()> fn;
};

inline std::vector<TestCase>& registry() {
  static std::vector<TestCase> r;
  return r;
}

inline int& checkCount() {
  static int n = 0;
  return n;
}
inline int& failCount() {
  static int n = 0;
  return n;
}

struct Registrar {
  Registrar(const char* n, std::function<void()> f) { registry().push_back({n, f}); }
};

#define TEST(name)                                        \
  static void test_##name();                              \
  static Registrar reg_##name(#name, test_##name);        \
  static void test_##name()

#define CHECK(cond)                                                             \
  do {                                                                          \
    checkCount()++;                                                             \
    if (!(cond)) {                                                              \
      failCount()++;                                                            \
      std::printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);            \
    }                                                                           \
  } while (0)

#define CHECK_NEAR(a, b, tol)                                                   \
  do {                                                                          \
    checkCount()++;                                                             \
    double _a = (a), _b = (b);                                                  \
    if (!(std::fabs(_a - _b) <= (tol))) {                                       \
      failCount()++;                                                            \
      std::printf("  FAIL %s:%d: %s = %.9g, expected %.9g (tol %g)\n", __FILE__, \
                  __LINE__, #a, _a, _b, (double)(tol));                         \
    }                                                                           \
  } while (0)

#define CHECK_STR(a, b)                                                         \
  do {                                                                          \
    checkCount()++;                                                             \
    std::string _a = (a), _b = (b);                                             \
    if (_a != _b) {                                                             \
      failCount()++;                                                            \
      std::printf("  FAIL %s:%d: %s\n    got:      \"%s\"\n    expected: \"%s\"\n", \
                  __FILE__, __LINE__, #a, _a.c_str(), _b.c_str());              \
    }                                                                           \
  } while (0)
