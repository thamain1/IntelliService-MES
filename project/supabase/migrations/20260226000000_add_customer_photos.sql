CREATE TABLE IF NOT EXISTS customer_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  photo_url   text NOT NULL,
  caption     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_customer_photos"
  ON customer_photos FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_customer_photos"
  ON customer_photos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "admin_dispatcher_delete_customer_photos"
  ON customer_photos FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'dispatcher', 'office_manager')
  ));

-- customer-photos storage bucket (public, 10MB, image/* only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-photos', 'customer-photos', true, 10485760,
  ARRAY['image/jpeg','image/png','image/jpg','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_upload_customer_photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-photos');

CREATE POLICY "public_read_customer_photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'customer-photos');
