import "../../engines/chrome/polyfill";
import { runBackground } from "../../ui/background";
import { chromeEngine } from "../../engines/chrome";

runBackground(chromeEngine);
