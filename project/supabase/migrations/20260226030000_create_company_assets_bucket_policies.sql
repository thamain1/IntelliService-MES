-- Storage policies for company-assets bucket
-- Bucket itself is created via Supabase dashboard/API (public, 10MB, image types)

CREATE POLICY "authenticated_upload_company_assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets');

CREATE POLICY "public_read_company_assets"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'company-assets');

CREATE POLICY "authenticated_update_company_assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets');

CREATE POLICY "authenticated_delete_company_assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets');
