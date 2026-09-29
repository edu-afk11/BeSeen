-- Trigger functions execute through their triggers and never need direct client access.
revoke execute on function public.capture_signup_consent() from public,anon,authenticated;
revoke execute on function public.erase_location_when_street_mode_ends() from public,anon,authenticated;
revoke execute on function public.require_location_consent_for_street_mode() from public,anon,authenticated;
revoke execute on function public.reject_blocked_request() from public,anon,authenticated;
revoke execute on function public.reject_blocked_match() from public,anon,authenticated;
revoke execute on function public.enforce_city_post_rate() from public,anon,authenticated;
revoke execute on function public.enforce_city_response_rate() from public,anon,authenticated;
revoke execute on function public.enforce_interaction_rate() from public,anon,authenticated;
revoke execute on function public.invoke_beseen_match_notification() from public,anon,authenticated;
revoke execute on function public.invoke_beseen_city_response_notification() from public,anon,authenticated;
