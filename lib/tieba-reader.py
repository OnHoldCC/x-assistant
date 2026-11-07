"""Anonymous public forum metadata, normalized for the existing meme pipeline."""
import asyncio
import json
import os
from pathlib import Path


def feed(pages):
    rows = []
    for page in pages:
        if page.err or page.forum.fname != '孙笑川':
            raise ValueError('孙笑川吧新帖读取失败')
        for thread in list(page)[:30]:
            if thread.fname != '孙笑川' or thread.is_share or thread.is_top:
                continue
            rows.append({
                'tid': thread.tid, 'forum_name': thread.fname,
                'title': thread.title[:300], 'abstract': thread.contents.text[:800],
                'media': [{'type': 'pic', 'big_pic': image.origin_src[:2048],
                           'water_pic': image.big_src[:2048], 'small_pic': image.src[:2048]}
                          for image in thread.contents.imgs[:4]],
            })
    return {'errno': 0, 'data': {'thread_list': rows}}


async def main():
    import aiotieba
    # Homebrew Python may lack its default CA bundle; use the system trust bundle.
    if not os.environ.get('SSL_CERT_FILE') and Path('/etc/ssl/cert.pem').is_file():
        os.environ['SSL_CERT_FILE'] = '/etc/ssl/cert.pem'
    async with aiotieba.Client(BDUSS='', STOKEN='', proxy=True, try_ws=False) as client:
        pages = await asyncio.wait_for(asyncio.gather(*[
            client.get_threads('孙笑川', pn=pn, rn=30, sort=aiotieba.ThreadSortType.CREATE)
            for pn in (1, 2)
        ]), 25)
        print(json.dumps(feed(pages), ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
