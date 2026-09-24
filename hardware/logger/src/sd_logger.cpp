// microSD logging: config file, one LOGnnnn.CSV per power-on, and a writer
// task that drains the row ring in 4-16 KB blocks.
//
// Crash safety: after every block the writer appends a "# key=value" trailer
// (start_utc, rows, dropped_rows, end_t_ms) and the next block overwrites it
// in place, so the file on the card always ends in a current trailer. The
// trailer only grows (counters are monotonic), so no stale bytes are left
// behind. Data reach the card at least once a second; fsync (directory entry
// and FAT update) runs every fsync_s seconds, so a power cut loses at most
// that much.
#include <FS.h>
#include <SD.h>
#include <SPI.h>

#include <atomic>

#include "app.h"
#include "saillog_csv.h"
#include "saillog_ringbuf.h"

namespace app {

static const size_t kMinBlock = 8 * 1024;
static const size_t kMaxBlock = 16 * 1024;
static const uint32_t kMaxLatencyMs = 1000;

static uint8_t s_ring_mem[RING_BYTES];
static saillog::ByteRing s_ring(s_ring_mem, RING_BYTES);

static SPIClass s_spi(FSPI);
static File s_file;
static char s_name[16] = "";
static std::atomic<bool> s_card_ok{false};
static std::atomic<bool> s_logging{false};
static std::atomic<bool> s_req_stop{false};
static std::atomic<bool> s_req_start{false};
static std::atomic<uint32_t> s_rows{0};
static std::atomic<uint32_t> s_dropped{0};
static std::atomic<uint32_t> s_level_captures{0};
static uint32_t s_data_end = 0;
static uint32_t s_last_write_ms = 0, s_last_sync_ms = 0;

static bool s_have_level = false;
static double s_level_roll = 0, s_level_pitch = 0;
static std::atomic<bool> s_level_dirty{false};
static portMUX_TYPE s_level_mux = portMUX_INITIALIZER_UNLOCKED;

static bool readWholeFile(const char* path, char* buf, size_t cap) {
  File f = SD.open(path, FILE_READ);
  if (!f) return false;
  size_t n = f.read(reinterpret_cast<uint8_t*>(buf), cap - 1);
  buf[n] = '\0';
  f.close();
  return true;
}

static void loadConfig() {
  static char text[4096];
  if (readWholeFile("/config.txt", text, sizeof(text))) {
    saillog::ConfigParseResult r = saillog::parseConfig(g_cfg, text);
    Serial.printf("config: %d keys applied, %d unknown, %d invalid", r.applied, r.unknown, r.invalid);
    if (r.first_bad_line) Serial.printf(" (first problem on line %d)", r.first_bad_line);
    Serial.println();
  } else {
    File f = SD.open("/config.txt", FILE_WRITE);
    if (f) {
      f.print(saillog::kDefaultConfigText);
      f.close();
      Serial.println("config: /config.txt missing, wrote defaults");
    }
  }
}

static void loadLevel() {
  char text[64];
  if (!readWholeFile("/level.txt", text, sizeof(text))) return;
  double r, p;
  if (sscanf(text, "%lf %lf", &r, &p) == 2 && fabs(r) < 45 && fabs(p) < 45) {
    s_have_level = true;
    s_level_roll = r;
    s_level_pitch = p;
    Serial.printf("level: roll0 %.2f pitch0 %.2f from /level.txt\n", r, p);
  }
}

static bool mountCard() {
  s_spi.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  if (!SD.begin(PIN_SD_CS, s_spi, SD_SPI_HZ, "/sd", 4, false)) return false;
  return SD.cardType() != CARD_NONE;
}

bool sdBegin() {
  bool ok = mountCard();
  s_card_ok = ok;
  if (!ok) {
    Serial.println("sd: no card / mount failed; running on defaults");
    return false;
  }
  loadConfig();
  loadLevel();
  return true;
}

bool sdCardOk() { return s_card_ok; }
bool sdLogging() { return s_logging; }
const char* sdFileName() { return s_name; }
uint32_t sdRows() { return s_rows; }
uint32_t sdDropped() { return s_dropped; }
size_t sdBufferUsed() { return s_ring.used(); }

bool sdLoadedLevel(double& r, double& p) {
  portENTER_CRITICAL(&s_level_mux);
  r = s_level_roll;
  p = s_level_pitch;
  bool have = s_have_level;
  portEXIT_CRITICAL(&s_level_mux);
  return have;
}

void sdNoteLevelCapture(double r, double p) {
  portENTER_CRITICAL(&s_level_mux);
  s_level_roll = r;
  s_level_pitch = p;
  s_have_level = true;
  portEXIT_CRITICAL(&s_level_mux);
  s_level_dirty = true;
  if (s_logging) s_level_captures++;
}

static uint32_t nextFileNumber() {
  uint32_t max_n = 0;
  File root = SD.open("/");
  if (root) {
    for (File f = root.openNextFile(); f; f = root.openNextFile()) {
      uint32_t n = saillog::logFileNumber(f.name());
      if (n > max_n) max_n = n;
      f.close();
    }
    root.close();
  }
  return max_n + 1;
}

bool sdStartFile() {
  if (!s_card_ok) return false;
  uint32_t n = nextFileNumber();
  char name[16];
  if (!saillog::logFileName(n, name)) return false;
  char path[20];
  snprintf(path, sizeof(path), "/%s", name);
  s_file = SD.open(path, FILE_WRITE);
  if (!s_file) {
    Serial.printf("sd: cannot create %s\n", path);
    return false;
  }
  strcpy(s_name, name);

  saillog::HeaderInfo h{};
  h.cfg = &g_cfg;
  h.logger = LOGGER_ID;
  h.board = BOARD_NAME;
  h.file_name = name;
  h.has_start_utc = firstFixUtc(h.start_utc_ms);
  portENTER_CRITICAL(&s_level_mux);
  h.has_level = s_have_level;
  h.level_roll_deg = s_level_roll;
  h.level_pitch_deg = s_level_pitch;
  portEXIT_CRITICAL(&s_level_mux);
  static char hdr[2048];
  size_t len = saillog::formatHeader(h, hdr, sizeof(hdr));
  if (!len || s_file.write(reinterpret_cast<uint8_t*>(hdr), len) != len) {
    s_file.close();
    return false;
  }
  s_file.flush();
  s_data_end = len;
  s_ring.clear();
  s_rows = 0;
  s_dropped = 0;
  s_level_captures = 0;
  s_last_write_ms = s_last_sync_ms = millis();
  s_logging = true;
  Serial.printf("sd: logging to %s\n", path);
  return true;
}

void sdRequestStop() { s_req_stop = true; }

bool sdPushRow(const char* row, size_t n) {
  if (!s_logging) return false;
  if (s_ring.push(row, n)) {
    s_rows++;
    return true;
  }
  s_dropped++;
  return false;
}

void sdNoteDropped() {
  if (s_logging) s_dropped++;
}

// Writes queued rows (up to max bytes) at s_data_end, then the trailer.
static bool writeBlock(size_t max_bytes) {
  if (!s_file.seek(s_data_end)) return false;
  size_t written = 0;
  while (written < max_bytes) {
    const uint8_t* p;
    size_t n = s_ring.peek(&p);
    if (!n) break;
    if (n > max_bytes - written) n = max_bytes - written;
    if (s_file.write(p, n) != n) return false;
    s_ring.consume(n);
    written += n;
  }
  s_data_end += written;
  saillog::TrailerInfo t{};
  t.has_start_utc = firstFixUtc(t.start_utc_ms);
  t.rows = s_rows;
  t.dropped_rows = s_dropped;
  t.end_t_ms = millis();
  t.level_captures = s_level_captures;
  char buf[192];
  size_t len = saillog::formatTrailer(t, buf, sizeof(buf));
  if (s_file.write(reinterpret_cast<uint8_t*>(buf), len) != len) return false;
  s_last_write_ms = millis();
  return true;
}

static void closeFile(bool ok) {
  s_logging = false;             // the sampler stops pushing
  vTaskDelay(pdMS_TO_TICKS(5));  // let an in-flight push finish
  if (ok) {
    // Drain everything that was queued before the stop.
    while (s_ring.used() && writeBlock(kMaxBlock)) {
    }
    s_file.flush();
  }
  s_file.close();
}

static void saveLevelFile() {
  double r, p;
  portENTER_CRITICAL(&s_level_mux);
  r = s_level_roll;
  p = s_level_pitch;
  portEXIT_CRITICAL(&s_level_mux);
  File f = SD.open("/level.txt", FILE_WRITE);
  if (f) {
    f.printf("%.3f %.3f\n# roll0 pitch0 (deg) captured on a level hull\n", r, p);
    f.close();
  }
}

void sdTask(void*) {
  uint32_t last_remount = 0;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(20));
    uint32_t now = millis();

    if (!s_card_ok) {
      // Card missing or failed: try again every 5 s and start a new file.
      if (now - last_remount > 5000) {
        last_remount = now;
        SD.end();
        if (mountCard()) {
          s_card_ok = true;
          sdStartFile();
        }
      }
      continue;
    }

    if (s_level_dirty.exchange(false)) saveLevelFile();

    if (s_req_stop.exchange(false) && s_logging) {
      closeFile(true);
      Serial.printf("sd: %s closed (%u rows, %u dropped)\n", s_name, (unsigned)s_rows.load(),
                    (unsigned)s_dropped.load());
    }
    if (s_req_start.exchange(false) && !s_logging) sdStartFile();
    if (!s_logging) continue;

    size_t used = s_ring.used();
    if (used >= kMinBlock || (used && now - s_last_write_ms >= kMaxLatencyMs)) {
      if (!writeBlock(kMaxBlock)) {
        Serial.println("sd: write failed, card removed?");
        closeFile(false);
        s_card_ok = false;
        continue;
      }
    }
    if (now - s_last_sync_ms >= g_cfg.fsync_s * 1000UL) {
      s_file.flush();  // fflush + fsync
      s_last_sync_ms = millis();
    }
  }
}

void sdRequestStart() { s_req_start = true; }

}  // namespace app
