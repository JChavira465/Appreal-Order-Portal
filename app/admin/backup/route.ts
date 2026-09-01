import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Full data export, platform-admin only. `?company=<slug>` exports one
// company; no slug exports every company.
//
// This is a portable copy, not disaster recovery -- see the `note` field
// in the payload. It captures rows, not the Supabase project itself:
// no auth users (so PINs/logins don't come back from this), and no
// uploaded image binaries, only the storage paths pointing at them.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_admin")
    .eq("id", user.id)
    .single();
  if (profile?.platform_admin !== true) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const slug = new URL(request.url).searchParams.get("company");
  const admin = createAdminClient();

  const { data: companies } = slug
    ? await admin.from("companies").select("*").eq("slug", slug)
    : await admin.from("companies").select("*").order("created_at");

  if (!companies || companies.length === 0) {
    return NextResponse.json({ error: "No such company." }, { status: 404 });
  }

  const rows = async (table: string, column: string, values: string[]) => {
    if (values.length === 0) return [];
    const { data } = await admin.from(table).select("*").in(column, values);
    return data ?? [];
  };

  const exported = [];
  for (const company of companies) {
    const byCompany = async (table: string) => {
      const { data } = await admin.from(table).select("*").eq("company_id", company.id);
      return data ?? [];
    };

    const [
      profiles,
      customers,
      orders,
      vendors,
      priceItems,
      priceModifiers,
      partnerSplits,
      rosterTemplates,
      venmoCollectors,
      loginEvents,
      issueReports,
      orderLinks,
    ] = await Promise.all([
      byCompany("profiles"),
      byCompany("customers"),
      byCompany("orders"),
      byCompany("vendors"),
      byCompany("price_items"),
      byCompany("price_modifiers"),
      byCompany("partner_splits"),
      byCompany("roster_template_players"),
      byCompany("venmo_collectors"),
      byCompany("login_events"),
      byCompany("issue_reports"),
      byCompany("order_links"),
    ]);

    const orderIds = orders.map((o) => o.id as string);
    const vendorIds = vendors.map((v) => v.id as string);

    const [
      orderItems,
      payments,
      activityLog,
      orderImages,
      orderCosts,
      trackingNumbers,
      vendorItemCosts,
      vendorPayments,
    ] = await Promise.all([
      rows("order_items", "order_id", orderIds),
      rows("payments", "order_id", orderIds),
      rows("activity_log", "order_id", orderIds),
      rows("order_images", "order_id", orderIds),
      rows("order_costs", "order_id", orderIds),
      rows("order_tracking_numbers", "order_id", orderIds),
      rows("vendor_item_costs", "vendor_id", vendorIds),
      rows("vendor_payments", "vendor_id", vendorIds),
    ]);

    const orderItemIds = orderItems.map((i) => i.id as string);
    const [orderItemSizes, orderItemCosts] = await Promise.all([
      rows("order_item_sizes", "order_item_id", orderItemIds),
      rows("order_item_costs", "order_item_id", orderItemIds),
    ]);

    const sizeIds = orderItemSizes.map((s) => s.id as string);
    const orderItemSizeNames = await rows(
      "order_item_size_names",
      "order_item_size_id",
      sizeIds,
    );

    exported.push({
      company,
      profiles,
      customers,
      orders,
      order_items: orderItems,
      order_item_sizes: orderItemSizes,
      order_item_size_names: orderItemSizeNames,
      order_item_costs: orderItemCosts,
      order_costs: orderCosts,
      order_images: orderImages,
      order_tracking_numbers: trackingNumbers,
      payments,
      activity_log: activityLog,
      vendors,
      vendor_item_costs: vendorItemCosts,
      vendor_payments: vendorPayments,
      price_items: priceItems,
      price_modifiers: priceModifiers,
      partner_splits: partnerSplits,
      roster_template_players: rosterTemplates,
      venmo_collectors: venmoCollectors,
      login_events: loginEvents,
      issue_reports: issueReports,
      order_links: orderLinks,
    });
  }

  const payload = {
    exported_at: new Date().toISOString(),
    note:
      "Portable data export. Does NOT include auth accounts (PINs/passwords) " +
      "or uploaded image files -- order_images holds storage paths only. " +
      "For true point-in-time recovery, rely on Supabase's own project backups.",
    companies: exported,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = slug
    ? `order-desk-${slug}-${stamp}.json`
    : `order-desk-all-companies-${stamp}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
