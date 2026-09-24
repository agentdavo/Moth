# On-board datalogger

The sailing datalogger (ESP32-S3 + BNO085 IMU + u-blox M10 GNSS + microSD, with passive taps on the receiver's servo channels) lives in [`hardware/logger/`](../hardware/logger/README.md). It works in an IOM radio yacht and on a foiling Moth.

- Build, wiring, bill of materials, installation, calibration and limitations: [`hardware/logger/README.md`](../hardware/logger/README.md)
- Wiring diagram: [`hardware/logger/wiring.svg`](../hardware/logger/wiring.svg)
- The log file contract shared with the analysis page: [`docs/LOG_FORMAT.md`](LOG_FORMAT.md)
- Analysis: `analysis.html` at the repository root
