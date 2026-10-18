import { NextResponse, type NextRequest } from "next/server";

const SECTIONS: Record<string, string> = {
  plans: "/plans",
  recipes: "/recipes",
  groceries: "/groceries",
  planning: "/groceries",
  lists: "/groceries/cart",
  templates: "/groceries/templates",
  settings: "/settings",
  trash: "/trash"
};

// Old links used "/?view=lists" etc. Send them to the section's own route.
// Signed-out visitors to "/" see the public landing page instead of being bounced to /login.
export function middleware(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view");
  if (!view) {
    if (request.cookies.has("nm_session")) return NextResponse.next();
    return NextResponse.rewrite(new URL("/inicio", request.url));
  }
  const url = request.nextUrl.clone();
  url.search = "";
  url.pathname = Object.hasOwn(SECTIONS, view) ? SECTIONS[view] : "/";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/" };
