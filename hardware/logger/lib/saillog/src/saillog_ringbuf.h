// Lock-free single-producer / single-consumer byte ring buffer.
// The sampling task pushes whole CSV rows (all or nothing); the SD writer
// task drains contiguous blocks. Capacity must be a power of two.
#pragma once

#include <atomic>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace saillog {

class ByteRing {
 public:
  ByteRing(uint8_t* storage, size_t capacity_pow2)
      : buf_(storage), cap_(capacity_pow2), mask_(capacity_pow2 - 1), head_(0), tail_(0) {}

  size_t capacity() const { return cap_; }
  size_t used() const {
    return head_.load(std::memory_order_acquire) - tail_.load(std::memory_order_acquire);
  }
  size_t freeSpace() const { return cap_ - used(); }

  // Producer: copies all n bytes or nothing.
  bool push(const void* data, size_t n) {
    size_t h = head_.load(std::memory_order_relaxed);
    size_t t = tail_.load(std::memory_order_acquire);
    if (cap_ - (h - t) < n) return false;
    size_t off = h & mask_;
    size_t first = cap_ - off < n ? cap_ - off : n;
    memcpy(buf_ + off, data, first);
    memcpy(buf_, static_cast<const uint8_t*>(data) + first, n - first);
    head_.store(h + n, std::memory_order_release);
    return true;
  }

  // Consumer: pointer to the oldest bytes and how many are contiguous.
  size_t peek(const uint8_t** p) const {
    size_t t = tail_.load(std::memory_order_relaxed);
    size_t h = head_.load(std::memory_order_acquire);
    size_t n = h - t;
    size_t off = t & mask_;
    if (n > cap_ - off) n = cap_ - off;
    *p = buf_ + off;
    return n;
  }

  void consume(size_t n) { tail_.store(tail_.load(std::memory_order_relaxed) + n, std::memory_order_release); }

  // Consumer side only, when the producer is stopped.
  void clear() { tail_.store(head_.load(std::memory_order_acquire), std::memory_order_release); }

 private:
  uint8_t* buf_;
  size_t cap_;
  size_t mask_;
  std::atomic<size_t> head_;
  std::atomic<size_t> tail_;
};

// Fixed-size SPSC queue of small records (servo widths from the edge ISR).
// N must be a power of two. push() never blocks; it drops when full.
template <typename T, uint32_t N>
class SpscQueue {
  static_assert((N & (N - 1)) == 0, "N must be a power of two");

 public:
  bool push(const T& v) {
    uint32_t h = head_.load(std::memory_order_relaxed);
    if (h - tail_.load(std::memory_order_acquire) >= N) {
      overflows_ = overflows_ + 1;
      return false;
    }
    items_[h & (N - 1)] = v;
    head_.store(h + 1, std::memory_order_release);
    return true;
  }
  bool pop(T& v) {
    uint32_t t = tail_.load(std::memory_order_relaxed);
    if (t == head_.load(std::memory_order_acquire)) return false;
    v = items_[t & (N - 1)];
    tail_.store(t + 1, std::memory_order_release);
    return true;
  }
  uint32_t overflows() const { return overflows_; }

 private:
  T items_[N];
  std::atomic<uint32_t> head_{0};
  std::atomic<uint32_t> tail_{0};
  volatile uint32_t overflows_ = 0;
};

}  // namespace saillog
