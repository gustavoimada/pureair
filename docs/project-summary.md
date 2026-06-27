# Project Summary

PureAir monitors air-conditioner filter conditions through pressure and environmental readings. The prototype is designed for installation near the filter, where the microcontroller can compare airflow-related sensor values and classify the filter condition as clean, attention, or dirty.

## Problem

Filter maintenance is commonly reactive or based on fixed schedules. Reactive maintenance waits for visible problems, while fixed schedules can replace filters too early or too late. Both approaches create health, cost, and energy-efficiency issues.

## Proposed Solution

The system collects sensor data with an ESP32, formats the readings as JSON, and sends them to a Node.js backend over Wi-Fi. If the network or server is unavailable, readings are stored on an SD card and synchronized later.

## Value

- Better air quality through earlier maintenance signals.
- Lower waste by avoiding unnecessary filter replacement.
- Lower risk by reducing delayed maintenance.
- Historical data for dashboards, reports, and future predictive analysis.

## Main Components

- ESP32 microcontroller.
- Pressure/temperature sensor.
- RTC module for timestamping.
- SD-card module for offline storage.
- Node.js API.
- PostgreSQL database.
- Optional MySQL/TiDB mirror and WhatsApp alert integration.
