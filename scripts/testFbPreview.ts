import { fetchLinkPreview } from '../src/utils/socialUrl';

fetchLinkPreview(
  'https://www.facebook.com/ShabirTravels/posts/pfbid0MHNmBceoTfgSh7MmxSjt23szpDCibfoPC5wm5KUZLhC8QFWeru8QP9kaS3ty7BwXl',
  'facebook'
).then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
