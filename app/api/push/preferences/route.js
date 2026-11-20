import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { readPushPreferences, writePushPreferences } from "../../../../lib/pushPreferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const input=await request.json();
    const ownerId=Number(input?.ownerId);
    const endpoint=input?.endpoint;
    if(!Number.isSafeInteger(ownerId)||ownerId<=0||typeof endpoint!=="string"||endpoint.length>4000)
      return NextResponse.json({error:"Invalid subscription details"},{status:400});

    // Change settings only for a registered endpoint and matching owner.
    const {data:device,error}=await supabaseAdmin.from("push_subscriptions")
      .select("id,owner_id").eq("endpoint",endpoint).eq("owner_id",ownerId)
      .eq("enabled",true).maybeSingle();
    if(error) throw error;
    if(!device) return NextResponse.json({error:"Enable notifications on this device before editing preferences."},{status:403});

    if(input.action==="load"){
      return NextResponse.json({ok:true,preferences:await readPushPreferences(endpoint)});
    }
    if(input.action==="save"&&input.preferences&&typeof input.preferences==="object"){
      const preferences=await writePushPreferences(endpoint,input.preferences);
      return NextResponse.json({ok:true,preferences});
    }
    return NextResponse.json({error:"Unknown preferences action"},{status:400});
  }catch(error){
    console.error("Push preferences error",error);
    return NextResponse.json({error:"Unable to update notification preferences"},{status:500});
  }
}
