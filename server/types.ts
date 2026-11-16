export type TextProviderId =
  | 'gemini'
  | 'openai'
  | 'deepseek'
  | 'anthropic'
  | 'yandex'
  | 'custom_openai';

export type ImageProviderId = 'gemini' | 'openai' | 'kandinsky' | 'disabled';

export interface Niche {
  id: number;
  name: string;
  rpm_range: string;
  growth_note: string;
  ai_fit: string;
  default_tone: string;
  cpa_notes: string;
  is_top10: number;
  created_at: string;
}

export interface CpaOffer {
  id: number;
  niche_id: number;
  niche_name?: string;
  title: string;
  affiliate_url: string;
  anchor_text: string;
  payout_note: string;
  pitch_hint: string;
  is_active: number;
  created_at: string;
}

export interface Topic {
  id: number;
  niche_id: number;
  niche_name?: string;
  title: string;
  angle: string;
  source: 'trend_rss' | 'ai_search' | 'manual';
  source_url: string;
  demand_score: number;
  competition_score: number;
  niche_fit_score: number;
  cpa_score: number;
  priority_score: number;
  status: 'new' | 'approved' | 'in_progress' | 'completed' | 'rejected';
  created_at: string;
}

export interface RagSample {
  id: number;
  niche_id: number;
  niche_name?: string;
  title: string;
  content: string;
  style_summary: string;
  embedding_json: string;
  avg_sentence_len: number;
  avg_paragraph_sentences: number;
  subjectivity_score: number;
  created_at: string;
}

export interface ValidatorCheckItem {
  id: number;
  code: string;
  label: string;
  criterion: string;
  status: 'pass' | 'warn' | 'fail';
  actual: string;
  action: string;
  details?: string;
}

export interface ValidatorReport {
  passed_count: number;
  total_count: number;
  overall_status: 'ready' | 'needs_humanizer' | 'needs_injector' | 'needs_rewrite' | 'manual_check';
  char_count: number;
  em_dash_count: number;
  cliche_matches: string[];
  checks: ValidatorCheckItem[];
  first_three_paragraphs_ok: boolean;
}

export interface FactcheckFlag {
  claim: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  suggestion: string;
}

export interface ArticleImage {
  role: 'cover' | 'inline_1' | 'inline_2';
  url: string;
  filename: string;
  prompt: string;
  caption: string;
  authenticity_note: string;
}

export interface PipelineStageState {
  stage: number;
  key: string;
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  duration_ms?: number;
  summary?: string;
  error?: string;
}

export interface Article {
  id: number;
  topic_id: number | null;
  niche_id: number;
  niche_name?: string;
  cpa_offer_id: number | null;
  title: string;
  subtitle: string;
  rubric: string;
  tags_json: string;
  preview_description: string;
  provider_used: string;
  status: 'queued' | 'generating' | 'needs_review' | 'ready' | 'published_tg' | 'failed';
  current_stage: number;
  stages_json: string;
  strategist_brief_json: string;
  seo_core_json: string;
  architect_plan: string;
  draft_text: string;
  stylist_text: string;
  final_markdown: string;
  final_html: string;
  validator_json: string;
  factcheck_flags_json: string;
  images_json: string;
  telegram_status: string;
  telegram_message_id: string;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  text_provider: TextProviderId;
  text_model: string;
  image_provider: ImageProviderId;
  image_model: string;
  custom_openai_base_url: string;
  custom_openai_model: string;
  topic_auto_approve_threshold: number;
  target_char_count: number;
  telegram_enabled: boolean;
  telegram_channel_id: string;
}

export interface ProviderStatus {
  id: string;
  name: string;
  kind: 'text' | 'image' | 'telegram';
  configured: boolean;
  note: string;
  defaultModel: string;
}
