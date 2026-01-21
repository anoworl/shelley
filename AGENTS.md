1. Never add sleeps to tests.
2. Brevity, brevity, brevity! Do not do weird defaults; have only one way of doing things; refactor relentlessly as necessary.
3. If something doesn't work, propagate the error or exit or crash. Do not have "fallbacks".
4. Do not keep old methods around for "compatibility"; this is a new project and there
   are no compatibility concerns yet.
5. The "predictable" model is a test fixture that lets you specify what a model would say if you said
   a thing. This is useful for interactive testing with a browser, since you don't rely on a model,
   and can fabricate some inputs and outputs. To test things, launch shelley with the relevant flag
   to only expose this model, and use shelley with a browser.
6. Always build via `make`. Use `make build-linux` for deployment. Individual commands like `pnpm run build` are redundant.
7. Run Go unit tests with `go test ./server` (or narrower packages while iterating) once the UI bundle is built.
8. To programmatically type into the React message input (e.g., in browser automation), you must use React's internal setter:
   ```javascript
   const input = document.querySelector('[data-testid="message-input"]');
   const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
   nativeInputValueSetter.call(input, 'your message');
   input.dispatchEvent(new Event('input', { bubbles: true }));
   ```
   Simply setting `input.value = '...'` won't work because React won't detect the change.
9. Commit your changes before finishing your turn.
10. If you are testing Shelley itself, be aware that you might be running "under" shelley,
  and indiscriminately running pkill -f shelley may break things.
11. To test the Shelley UI in a separate instance, build with `make build`, then run on a
    different port with a separate database:
    ```
    ./bin/shelley -config /exe.dev/shelley.json -db /tmp/shelley-test.db serve -port 8002
    ```
    Then use browser tools to navigate to http://localhost:8002/ and interact with the UI.
12. To test the production instance (after `deploy_self`), use browser tools to navigate to
    http://localhost:3000/. If you get errors like "Failed to load conversations", you need
    to start a mitmproxy to inject auth headers. See [AGENT_TESTING.md](./AGENT_TESTING.md)
    section "Testing the Production Instance (Port 9999)" for the mitmdump command.
13. Do NOT commit without explicit user permission. Always ask before committing.
14. Before modifying any file, check if there's an AGENT.md in that directory or parent directories. Read it first.
15. All documentation must be written in English.
16. Before committing, read [AGENT_COMMITTING.md](./AGENT_COMMITTING.md) for commit message format, branch naming, and PR guidelines.
17. Before running tests, read [AGENT_TESTING.md](./AGENT_TESTING.md) for testing conventions.
18. Prioritize code cleanliness over fixing issues that have no practical UX impact. Do not add complexity for theoretical correctness.
19. **⚠️ CRITICAL: NEVER run `systemctl stop/start/restart shelley` directly!** This will terminate the Shelley instance you are running under. Always use the `deploy_self` tool for deployments. Build first with `make build-linux`, then call `deploy_self` with the binary path.
