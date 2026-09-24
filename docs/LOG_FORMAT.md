# Sailing datalogger log format (v1)

This is the one contract between the on-board logger (`hardware/logger/`) and the analysis page (`analysis.html`). Both sides must follow it exactly. Where the analysis page also accepts other formats (GPX, plain CSV exports), that is an extra; this format is the reference.

## File

- **Encoding and layout:** UTF-8 text, `\n` line endings, one file per power-on, named `LOG0001.CSV`, `LOG0002.CSV`, …
- **File order:**
  1. metadata lines starting with `#`, as `# key=value`;
  2. one header line with the column names;
  3. data rows at a fixed rate (`rate_hz`, default 50).
- **Missing values:** an empty field (for example no GNSS fix yet, or a servo channel not connected).
- **Numbers:** plain decimal with a `.` separator, no thousands separators.

## Metadata keys

| Key | Example | Meaning |
|---|---|---|
| `format` | `sail-log v1` | First line; identifies the format and version |
| `logger` | `esp32s3-bno085-m10 fw 1.0.0` | Hardware and firmware id |
| `boat` | `IOM GBR 123` | Free text, from `config.txt` |
| `class` | `IOM` / `Moth` / `other` | Selects default models in the analysis page |
| `rate_hz` | `50` | Data-row rate. Must divide 1000 (10, 20, 25, 40, 50 or 100) |
| `start_utc` | `2026-09-23T10:15:02Z` | UTC of the first GNSS fix. Usually unknown when the file opens, so it normally appears only in the trailer |
| `declination_deg` | `-1.2` | Magnetic declination. `yaw` is already corrected to true when this is set |
| `imu_mount` | `x_fwd_y_port_z_up` | Sensor-to-body mapping applied on board. Informational only: the logged data are already in the boat body frame |
| `rudder_center_us`, `rudder_deg_per_us` | `1500`, `0.09` | Converts the rudder pulse to rudder angle, + = trailing edge to port (bears the bow to starboard) |
| `sheet_in_us`, `sheet_out_us` | `1100`, `1900` | Pulse at sheet fully in and fully out |
| `aux1_name`, `aux2_name` | `jib`, `flap` | Names of the optional extra channels |
| `tws_source` | `none` / `anemometer` / `manual` | Whether the `tws`/`twd` columns are real |

Unknown keys are ignored. The firmware also writes `board`, `file`, `imu_fusion` (`rotation` or `game`), `yaw_ref`, `level_roll_deg`, `level_pitch_deg` and `gnss_rate_hz`.

**Trailer.** The file always ends with `#` lines holding `start_utc`, `rows`, `dropped_rows` and `end_t_ms`. The logger rewrites them in place after every block it writes. After a power cut, the last data line may be partial; readers must drop any row with the wrong number of fields.

## Columns (in this order)

| Column | Unit | Notes |
|---|---|---|
| `t_ms` | ms | Time since boot, monotonic |
| `utc_ms` | ms since 1970-01-01 UTC | Empty until the first GNSS time |
| `gnss_new` | 0/1 | 1 on the row where a new GNSS solution arrived; lat/lon/sog/cog repeat the last solution on other rows |
| `lat`, `lon` | deg | WGS-84, 7 decimals |
| `sog` | m/s | GNSS Doppler speed over ground |
| `cog` | deg true | Course over ground, 0–360 |
| `sacc` | m/s | GNSS speed accuracy estimate |
| `hacc` | m | GNSS horizontal accuracy estimate |
| `fix` | 0–3 | 0 none, 2 2-D, 3 3-D |
| `sats` | count | Satellites used |
| `yaw` | deg | Heading 0–360, true if `declination_deg` is set, else magnetic. Empty for the whole file when `imu_fusion=game` (no magnetometer); use COG instead |
| `roll` | deg | Heel: **+ = starboard side down** |
| `pitch` | deg | **+ = bow up** |
| `gx`, `gy`, `gz` | deg/s | Body rates about x (forward), y (starboard), z (down) |
| `ax`, `ay`, `az` | m/s² | Accelerometer reading (specific force) in the body frame. At rest and level, az ≈ −9.81. At rest heeled to starboard by φ: ay ≈ −g·sin φ and az ≈ −g·cos φ. Do not infer heel sign from ay without this |
| `rudder_us`, `sheet_us`, `aux1_us`, `aux2_us` | µs | Servo pulse widths from the receiver outputs, empty if not connected |
| `vbat` | V | Supply voltage |
| `event` | integer | 0 normally. The button or a transmitter switch writes a positive marker (1, 2, …) on one row. Used to tag A/B test legs |
| `tws`, `twd` | m/s, deg true | Only if a wind source exists (`tws_source`), else empty |

Body frame: x forward, y to starboard, z down (right-handed). Heel to starboard is positive roll. For a boat on port tack (wind over the port side), the heel is normally to starboard, so roll is positive.

## Example

```
# format=sail-log v1
# logger=esp32s3-bno085-m10 fw 1.0.0
# boat=IOM GBR 123
# class=IOM
# rate_hz=50
# declination_deg=-1.2
# imu_mount=x_fwd_y_port_z_up
# rudder_center_us=1500
# rudder_deg_per_us=0.09
# sheet_in_us=1100
# sheet_out_us=1900
# tws_source=none
t_ms,utc_ms,gnss_new,lat,lon,sog,cog,sacc,hacc,fix,sats,yaw,roll,pitch,gx,gy,gz,ax,ay,az,rudder_us,sheet_us,aux1_us,aux2_us,vbat,event,tws,twd
120020,1790158502020,1,50.8123456,-1.3123456,1.132,41.2,0.05,1.1,3,17,43.9,11.4,0.8,0.12,-0.40,1.35,0.20,-1.94,-9.62,1512,1160,,,5.02,0,,
120040,1790158502040,0,50.8123456,-1.3123456,1.132,41.2,0.05,1.1,3,17,44.0,11.5,0.8,0.10,-0.35,1.30,0.18,-1.96,-9.61,1512,1160,,,5.02,0,,
# start_utc=2026-09-23T10:15:02Z
# rows=2
# dropped_rows=0
# end_t_ms=120040
```
