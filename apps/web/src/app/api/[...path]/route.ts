import { NextRequest, NextResponse } from "next/server";

async function handleProxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (process.env.NODE_ENV === "production" && !process.env.BACKEND_URL) {
    console.error(
      "FATAL: BACKEND_URL environment variable is missing in production.",
    );
    return NextResponse.json(
      { message: "Internal server error: BFF proxy is misconfigured." },
      { status: 500 },
    );
  }
  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001/api/v1";

  const resolvedParams = await params;
  const path = resolvedParams.path.join("/");

  // Custom auth/logout endpoint
  if (path === "auth/logout") {
    const response = NextResponse.json({ message: "Logged out successfully" });
    response.cookies.set("atlas_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    return response;
  }

  // Forward query string parameters
  const searchParams = req.nextUrl.search;
  const url = `${BACKEND_URL}/${path}${searchParams}`;

  // Read the httpOnly cookie
  const token = req.cookies.get("atlas_token")?.value;

  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Forward request headers (specifically content-type, content-length, accept)
  const incomingContentType = req.headers.get("content-type");
  if (incomingContentType) {
    headers.set("content-type", incomingContentType);
  }
  const incomingAccept = req.headers.get("accept");
  if (incomingAccept) {
    headers.set("accept", incomingAccept);
  }

  // Read the request body as an ArrayBuffer to preserve multipart/form-data or binary content
  let body: any = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      body = await req.arrayBuffer();
    } catch {
      body = null;
    }
  }

  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body,
      // duplex required when body is stream/buffer in fetch
      duplex: "half",
    } as any);

    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");

    // Handle authentication cookie setting on success
    if (
      (path === "auth/login" || path === "auth/register") &&
      (res.status === 200 || res.status === 201) &&
      isJson
    ) {
      const data = await res.json();
      const response = NextResponse.json(data, { status: res.status });
      const accessToken = data.accessToken || data.token;
      if (accessToken) {
        response.cookies.set("atlas_token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days
        });
      }
      return response;
    }

    // Return the response, streaming the body, preserving status and headers
    const response = new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
    });

    res.headers.forEach((value, key) => {
      // Exclude transfer-encoding or content-encoding if they interfere with server response parsing
      if (
        key.toLowerCase() !== "transfer-encoding" &&
        key.toLowerCase() !== "content-encoding"
      ) {
        response.headers.set(key, value);
      }
    });

    return response;
  } catch (error: any) {
    console.error(`BFF Proxy Error forwarding to ${url}:`, error);
    // Sanitize downstream exception from being leaked to client
    return NextResponse.json(
      { message: "Internal server error in BFF proxy" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest, context: any) {
  return handleProxy(req, context);
}
export async function POST(req: NextRequest, context: any) {
  return handleProxy(req, context);
}
export async function PUT(req: NextRequest, context: any) {
  return handleProxy(req, context);
}
export async function DELETE(req: NextRequest, context: any) {
  return handleProxy(req, context);
}
export async function PATCH(req: NextRequest, context: any) {
  return handleProxy(req, context);
}
