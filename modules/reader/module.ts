import { defineModule } from "@aihot/contracts/modules";

export default defineModule({ name: "reader", pages: [{ path: "account", file: "web/account.tsx" }], apiPaths: [/^\/api\/reader(?:\/|$)/] });
