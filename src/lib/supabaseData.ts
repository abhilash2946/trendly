import { dataUrlToBlob } from './aiGateway';
import { supabase } from './supabaseClient';
import type { ProfileRecord, SavedLookRecord } from '../types';

async function upsertLegacyProfile(payload: Record<string, unknown>) {
  try {
    await supabase.from('profiles').upsert(payload);
  } catch {
    return;
  }
}

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function loadUserProfile(userId: string) {
  const primary = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
  if (!primary.error && primary.data) {
    return primary.data as ProfileRecord;
  }

  const fallback = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (fallback.error) {
    throw fallback.error;
  }

  return (fallback.data as ProfileRecord | null) || null;
}

export async function saveUserProfile(profile: ProfileRecord) {
  const payload = {
    ...profile,
    updated_at: new Date().toISOString(),
  };

  const result = await supabase.from('user_profiles').upsert(payload).select().single();
  if (result.error) {
    throw result.error;
  }

  await upsertLegacyProfile(payload);
  return result.data as ProfileRecord;
}

export async function saveGeneratedLook(input: {
  userId: string;
  dataUrl: string;
  prompt: string;
  source: SavedLookRecord['source'];
}) {
  const filePath = `${input.userId}/${Date.now()}-${crypto.randomUUID()}.png`;
  const blob = dataUrlToBlob(input.dataUrl);

  const upload = await supabase.storage
    .from('generated-media')
    .upload(filePath, blob, { contentType: 'image/png', upsert: false });

  if (upload.error) {
    throw upload.error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('generated-media').getPublicUrl(filePath);

  const saved = await supabase
    .from('ar_mirror_saves')
    .insert({
      user_id: input.userId,
      image_url: publicUrl,
      prompt: input.prompt,
      source: input.source,
    })
    .select()
    .single();

  if (saved.error) {
    throw saved.error;
  }

  return saved.data as SavedLookRecord;
}