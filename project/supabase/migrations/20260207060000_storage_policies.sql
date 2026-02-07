-- Storage policies for company-assets and logos buckets

-- Allow authenticated users to upload to company-assets
CREATE POLICY "Allow authenticated uploads to company-assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-assets');

-- Allow authenticated users to read from company-assets
CREATE POLICY "Allow authenticated reads from company-assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-assets');

-- Allow authenticated users to update in company-assets
CREATE POLICY "Allow authenticated updates to company-assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-assets')
WITH CHECK (bucket_id = 'company-assets');

-- Allow authenticated users to delete from company-assets
CREATE POLICY "Allow authenticated deletes from company-assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-assets');

-- Public read access for company-assets (for logo display)
CREATE POLICY "Allow public reads from company-assets"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'company-assets');
