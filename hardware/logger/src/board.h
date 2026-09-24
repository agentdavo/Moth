// Pin map. Values come from platformio.ini build flags; the defaults below
// are the XIAO ESP32S3 wiring documented in README.md / wiring.svg.
#pragma once

#ifndef BOARD_NAME
#define BOARD_NAME "xiao_esp32s3"
#endif
#ifndef PIN_I2C_SDA
#define PIN_I2C_SDA 5
#endif
#ifndef PIN_I2C_SCL
#define PIN_I2C_SCL 6
#endif
#ifndef PIN_IMU_RST
#define PIN_IMU_RST -1
#endif
#ifndef PIN_GNSS_RX
#define PIN_GNSS_RX 44
#endif
#ifndef PIN_GNSS_TX
#define PIN_GNSS_TX 43
#endif
#ifndef PIN_SD_SCK
#define PIN_SD_SCK 7
#endif
#ifndef PIN_SD_MISO
#define PIN_SD_MISO 8
#endif
#ifndef PIN_SD_MOSI
#define PIN_SD_MOSI 9
#endif
#ifndef PIN_SD_CS
#define PIN_SD_CS 3
#endif
#ifndef PIN_RUDDER
#define PIN_RUDDER 1
#endif
#ifndef PIN_SHEET
#define PIN_SHEET 2
#endif
#ifndef PIN_AUX1
#define PIN_AUX1 39
#endif
#ifndef PIN_AUX2
#define PIN_AUX2 40
#endif
#ifndef PIN_VBAT
#define PIN_VBAT 4
#endif
#ifndef PIN_BUTTON
#define PIN_BUTTON 41
#endif
#ifndef PIN_SPORT
#define PIN_SPORT 42
#endif
#ifndef PIN_LED
#define PIN_LED 21
#endif
#ifndef LED_ACTIVE_LOW
#define LED_ACTIVE_LOW 0
#endif
#ifndef LED_IS_RGB
#define LED_IS_RGB 0
#endif
#ifndef SAILLOG_SPORT
#define SAILLOG_SPORT 1
#endif

// SD SPI clock. 20 MHz is conservative for breakout boards with long wires.
#ifndef SD_SPI_HZ
#define SD_SPI_HZ 20000000
#endif
// Row ring buffer in internal RAM: ~6 s of 50 Hz rows at ~170 B/row.
#ifndef RING_BYTES
#define RING_BYTES (64 * 1024)
#endif
