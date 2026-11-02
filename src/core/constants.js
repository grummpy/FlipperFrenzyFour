/** Shared tunables for Flipper Frenzy Four. Times are in seconds. */

export const TABLE = 1000;
export const CENTER = TABLE / 2;

export const BALL_R = 13;
export const MAX_BALL_SPEED = 760;
export const MIN_BALL_SPEED = 210;
export const SPAWN_SPEED_MIN = 250;
export const SPAWN_SPEED_MAX = 340;
export const SPAWN_RADIUS = 96;

export const VORTEX_ACCEL = 48;

export const DRAIN_HALF = 200;
export const FLIPPER_INSET = 46;
export const FLIPPER_LEN = 100;
export const FLIPPER_R = 9;
export const WIDE_SCALE = 1.62;
export const FLIPPER_OMEGA = 11.5;
export const LEFT_REST = -1.05;
export const LEFT_ACTIVE = 1.29;
export const RIGHT_REST = Math.PI + 1.05;
export const RIGHT_ACTIVE = Math.PI - 1.29;

export const WALL_RESTITUTION = 0.99;
export const FLIPPER_RESTITUTION = 0.9;
export const BUMPER_R = 30;
export const BUMPER_BOOST = 460;
export const TARGET_R = 18;
export const TARGET_COOLDOWN = 2.15;
export const SPINNER_LEN = 76;
export const SPINNER_R = 7;
export const SPINNER_OMEGA = 2.15;

export const NUDGE_ACCEL = 560;
export const TILT_RATE = 0.95;
export const TILT_DECAY = 0.38;
export const TILT_LOCK = 1.85;

export const START_LIVES = 10;
export const WINS_NEEDED_DEFAULT = 2;
export const WIDE_DURATION = 10;
export const SHIELD_DURATION = 8;
export const BALL_ADD_INTERVAL = 8;
export const AMBIENT_BALLS = 3;
export const MAX_BALLS = 5;
export const COUNTDOWN_SECONDS = 3;
export const BANNER_SECONDS = 2.6;

export const STEP = 1 / 60;
export const SUBSTEPS = 4;

export const SIDES = ["south", "east", "north", "west"];

export const PLAYER_META = [
  { index: 0, name: "P1", side: "south", label: "Bottom" },
  { index: 1, name: "P2", side: "east", label: "Right" },
  { index: 2, name: "P3", side: "north", label: "Top" },
  { index: 3, name: "P4", side: "west", label: "Left" },
];

export const POWERUPS = ["multiball", "wide", "shield"];
