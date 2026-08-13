import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/subscription/webhook/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Verify ASAAS-ACCESS-TOKEN if set in env
          const asaasToken = process.env['ASAAS_ACCESS_TOKEN'];
          const requestToken = request.headers.get("asaas-access-token");
          
          if (asaasToken && requestToken !== asaasToken) {
            return new Response("Unauthorized", { status: 401 });
          }

          const body = await request.json();
          console.log("Asaas Webhook received:", body);

          // Handle events like:
          // PAYMENT_CONFIRMED
          // PAYMENT_RECEIVED
          // PAYMENT_OVERDUE
          // PAYMENT_DELETED
          
          // Logic for updating subscription status in DB would go here
          
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Webhook error:", error);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
