"""開発/プレイ用ローカルサーバ (キャッシュ無効化付き)。

  python serve.py          # PC 専用 (127.0.0.1:8765)
  python serve.py --lan    # 同じ Wi-Fi のスマホからも遊べる (0.0.0.0:8765)
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import socket
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def lan_ip():
    """この PC の LAN 側 IPv4 を取得。
    UDP ソケットの宛先を設定するだけで、パケットは一切送信されない
    (ルーティング判定のみ → どの NIC の IP を相手に見せるかが分かる)。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


if __name__ == '__main__':
    lan = '--lan' in sys.argv
    host = '0.0.0.0' if lan else '127.0.0.1'
    print(f'serving http://127.0.0.1:{PORT}/')
    if lan:
        print(f'スマホから:  http://{lan_ip()}:{PORT}/   (PC と同じ Wi-Fi に繋いで開く)')
        print('(終了するにはこのウィンドウで Ctrl+C、または閉じる)')
    ThreadingHTTPServer((host, PORT), Handler).serve_forever()
