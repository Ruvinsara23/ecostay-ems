#pragma once

#include <stdint.h>

struct VacancyClearTimer {
  bool active;
  uint32_t startedAt;
};

struct VacancyClearEvaluation {
  VacancyClearTimer timer;
  bool confirmed;
};

constexpr VacancyClearEvaluation evaluateVacancyClearWindow(
  VacancyClearTimer timer,
  bool vacancyPhase,
  bool doorOpen,
  bool humanDetected,
  uint32_t now,
  uint32_t timeoutMs
) {
  // PlatformIO's ESP32 Arduino toolchain compiles as C++11, where a constexpr
  // function body must be a single return statement.
  return !vacancyPhase || doorOpen || humanDetected
    ? VacancyClearEvaluation{{false, 0}, false}
    : !timer.active
      ? VacancyClearEvaluation{{true, now}, false}
      : VacancyClearEvaluation{
          timer,
          static_cast<uint32_t>(now - timer.startedAt) >= timeoutMs
        };
}

// Compile-time regression scenarios exercise the exact helper used by the
// physical sketch, including reset and restart of the complete clear window.
namespace occupancy_policy_self_test {
constexpr uint32_t TIMEOUT_MS = 30000;

constexpr VacancyClearEvaluation STARTED = evaluateVacancyClearWindow(
  {false, 0}, true, false, false, 0, TIMEOUT_MS
);
static_assert(STARTED.timer.active && !STARTED.confirmed);

constexpr VacancyClearEvaluation BEFORE_TIMEOUT = evaluateVacancyClearWindow(
  STARTED.timer, true, false, false, 29999, TIMEOUT_MS
);
static_assert(!BEFORE_TIMEOUT.confirmed);

constexpr VacancyClearEvaluation RESET_BY_PRESENCE = evaluateVacancyClearWindow(
  STARTED.timer, true, false, true, 20000, TIMEOUT_MS
);
static_assert(!RESET_BY_PRESENCE.timer.active);
static_assert(!RESET_BY_PRESENCE.confirmed);

constexpr VacancyClearEvaluation RESTARTED = evaluateVacancyClearWindow(
  RESET_BY_PRESENCE.timer, true, false, false, 21000, TIMEOUT_MS
);
static_assert(RESTARTED.timer.active && !RESTARTED.confirmed);

constexpr VacancyClearEvaluation RESTART_BEFORE_TIMEOUT =
  evaluateVacancyClearWindow(
    RESTARTED.timer, true, false, false, 50999, TIMEOUT_MS
  );
static_assert(!RESTART_BEFORE_TIMEOUT.confirmed);

constexpr VacancyClearEvaluation RESTART_CONFIRMED =
  evaluateVacancyClearWindow(
    RESTARTED.timer, true, false, false, 51000, TIMEOUT_MS
  );
static_assert(RESTART_CONFIRMED.confirmed);

constexpr VacancyClearEvaluation RESET_BY_DOOR = evaluateVacancyClearWindow(
  STARTED.timer, true, true, false, 25000, TIMEOUT_MS
);
static_assert(!RESET_BY_DOOR.timer.active);
static_assert(!RESET_BY_DOOR.confirmed);
}  // namespace occupancy_policy_self_test
