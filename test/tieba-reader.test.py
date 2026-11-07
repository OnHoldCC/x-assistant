import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace as Item
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('reader', Path(__file__).parents[1] / 'lib/tieba-reader.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class Page(list):
    err = None
    forum = Item(fname='孙笑川')


class ReaderTest(unittest.TestCase):
    def test_only_same_forum_body_images_keep_their_text_and_original(self):
        image = Item(origin_src='https://tiebapic.baidu.com/original.jpg',
                     big_src='https://tiebapic.baidu.com/big.jpg',
                     src='https://tiebapic.baidu.com/small.jpg')
        thread = Item(tid=123, fname='孙笑川', title='反应图', is_share=False,
                      is_top=False, contents=Item(text='原帖正文', imgs=[image] * 6))
        result = reader.feed([Page([thread])])['data']['thread_list']
        self.assertEqual(result[0]['abstract'], '原帖正文')
        self.assertEqual(result[0]['media'][0]['big_pic'], image.origin_src)
        self.assertEqual(len(result[0]['media']), 4)
        for field, value in [('fname', '其他吧'), ('is_share', True), ('is_top', True)]:
            bad = Item(**{**vars(thread), field: value})
            self.assertEqual(reader.feed([Page([bad])])['data']['thread_list'], [])
        page = Page([thread])
        page.err = RuntimeError('unavailable')
        with self.assertRaises(ValueError):
            reader.feed([page])


if __name__ == '__main__':
    unittest.main()
