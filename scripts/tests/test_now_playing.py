import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('now_playing',Path(__file__).resolve().parents[1]/'apple_tv_now_playing.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ArtworkMime(unittest.TestCase):
 def test_missing_mime_is_recovered_from_real_image_headers(self):
  for data,mime in [(b'\xff\xd8\xffrest','image/jpeg'),(b'\x89PNG\r\n\x1a\nrest','image/png'),(b'GIF89arest','image/gif'),(b'RIFF0000WEBPrest','image/webp')]:self.assertEqual(module.artwork_mime(data),mime)
 def test_svg_html_and_unknown_bytes_are_rejected(self):
  for data in [b'<svg></svg>',b'<html>bad</html>',b'',b'not image']:self.assertIsNone(module.artwork_mime(data))
if __name__=='__main__':unittest.main()
