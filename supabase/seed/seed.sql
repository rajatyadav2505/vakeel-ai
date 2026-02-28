insert into public.profiles (id, clerk_user_id, role, full_name, phone, bar_council_id)
values
  ('11111111-1111-1111-1111-111111111111', 'user_demo_advocate', 'ADVOCATE', 'Demo Advocate', '+919999999999', 'BCI-DEL-2026-001')
on conflict (clerk_user_id) do nothing;

insert into public.cases (
  id,
  owner_user_id,
  title,
  cnr_number,
  case_type,
  stage,
  court_name,
  summary,
  client_name,
  opponent_name,
  jurisdiction,
  lawyer_verified_for_export
) values (
  '22222222-2222-2222-2222-222222222222',
  'user_demo_advocate',
  'Demo Constitutional Writ',
  'DLHC010001112026',
  'constitutional',
  'analysis',
  'Delhi High Court',
  'Sample constitutional challenge concerning arbitrary administrative action and urgent interim relief.',
  'A. Petitioner',
  'State Department',
  'Delhi',
  true
)
on conflict (id) do nothing;

insert into public.legal_corpus (id, source, title, content, citation_url)
values
  ('bare-act-art-21', 'bare_act', 'Constitution Article 21', 'No person shall be deprived of his life or personal liberty except according to procedure established by law.', 'https://www.indiacode.nic.in'),
  ('bare-act-order-39', 'bare_act', 'CPC Order XXXIX Rules 1-2', 'Temporary injunction powers in civil disputes.', 'https://www.indiacode.nic.in')
on conflict (id) do nothing;

insert into public.simulations (
  id,
  owner_user_id,
  case_id,
  mode,
  headline,
  confidence,
  win_probability,
  strategy_json
) values (
  '33333333-3333-3333-3333-333333333333',
  'user_demo_advocate',
  '22222222-2222-2222-2222-222222222222',
  'multi_agent',
  'Seed simulation: early interim strategy',
  0.79,
  0.73,
  '{"headline":"Seed strategy","rankedPlan":[{"step":1,"opponentLikelyMove":"Adjournment","recommendedCounterMove":"Seek strict timeline order","chanakyaTag":"dand","confidence":0.79}],"payOffMatrix":[[6,2],[8,4]],"proposals":[],"citations":[]}'
)
on conflict (id) do nothing;
