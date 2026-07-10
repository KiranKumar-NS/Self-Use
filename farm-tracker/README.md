# FarmTracker

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.4.

## User roles & custom claims

Authorization is role-based (`admin` / `manager` / `viewer`). The authoritative
role lives in the **Firebase Auth custom claim** `role` — not in the
`users/{uid}` Firestore document (that copy is only for display in the admin UI).

Workflow:

1. A newly registered user has **no role claim** and is treated as `viewer`
   until an admin assigns a role.
2. An admin assigns/changes a role by running the out-of-band script:
   ```bash
   node firebase/set-custom-claims.js <uid> <role>
   ```
   The script requires `service-account-key.json` (never commit it — it is
   gitignored).
3. Role changes only take effect after the user **signs out and back in**
   (the ID token must be refreshed to pick up the new claim).
4. `assignedSegments` (manager segment restrictions) live on the `users/{uid}`
   document and take effect immediately — no re-login needed.

## Deploying

Always do a clean production build before deploying:

```bash
rm -rf dist && npx ng build --configuration production && firebase deploy
```

`firebase deploy` also publishes `firestore.rules` and
`firestore.indexes.json` — keep both committed and in sync with the console.
Test header/CSP changes on a preview channel first:

```bash
firebase hosting:channel:deploy preview
```

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
