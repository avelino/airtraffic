import Browser from "webextension-polyfill";

(globalThis as unknown as { browser: typeof browser }).browser = Browser;
