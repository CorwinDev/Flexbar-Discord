# SDK fixes

The plugin uses the published SDKs, not replacement transports. Exact package
versions are pinned and `postinstall` applies these patches with failure treated
as an installation error. Do not silently drop patches on dependency upgrades.

| Package                   | Runtime changes                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @corwinjs/rpcord 1.2.0    | Find IPC across available runtime/tmp locations, bound connection/READY waits, assemble fragmented/coalesced frames, respect Buffer view bounds, preserve binary ping payloads, reject outstanding requests on close, handle protocol close/errors without uncaught throws, and expose raw request with a correlated deadline. |
| @eniac/flexdesigner 1.0.3 | Single connection/retry after error+close, stop/open hooks, reject outstanding calls on disconnect/stop, bounded config calls, avoid config payloads in timeout messages, and reply to handler failures with their original request identity.                                                                                  |

The raw RPC request is used for explicit AUTHORIZE/AUTHENTICATE. The plugin
exchanges/refreshes OAuth tokens and persists rotated tokens itself, avoiding the
SDK's legacy automatic authorization-code renewal flow. Ordinary actions use
RPClient getVoiceSettings/setVoiceSettings/getGuilds/getSoundboardSounds/
playSoundboardSound/toggleVideo/subscribe; host messaging uses the actual
FlexDesigner singleton and its draw/set/config methods.

Patches target the distributed JavaScript consumed by Rollup. They are not
upstream releases and do not establish that every unused SDK API is repaired.
On an SDK upgrade, review its published runtime/API changes, adjust or remove
individual fixes and verify a clean installation and built plugin. Do not rely
on manually edited node_modules surviving npm install.

Validation for this change: clean npm ci applies both patches; build/format/syntax
checks pass. The actual bundle ran against isolated local fake host/Discord peers
for fragmented READY, cached authorization, voice state, mute and Disconnect.
No persistent test suite was restored. No live account/device checks or plugin
deployment were performed. Dependency-cycle warnings remain visible; no warning filter is installed.
The redundant ESM top-level-this guard in the SDK async helper is removed by
the SDK patch, retaining its existing local helper implementation.
