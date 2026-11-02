// Lets `node --test tests/` run every core test. This Node build treats a
// directory argument as a single entry, so the folder needs an index.
import "./arcade.test.js";
import "./game.test.js";
import "./input.test.js";
import "./physics.test.js";
import "./rng.test.js";
