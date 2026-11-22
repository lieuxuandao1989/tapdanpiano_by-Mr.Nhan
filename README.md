# Tác giả: Trần Trí Nhân

Ứng dụng tập piano bằng tiếng Việt, chạy trong trình duyệt. Mở `index.html` rồi chọn hoặc nhập bản nhạc để tập. Tệp bản nhạc được đọc trên máy của bạn.

## Tập từ bản nhạc

1. Chọn **Nhập bản nhạc** hoặc kéo thả tệp `.pdf`, `.png`, `.musicxml`, `.xml`, `.mxl`, `.mid` hoặc `.midi`.
2. Chọn **Hai tay**, **Tay phải** hoặc **Tay trái**. Ứng dụng phân tay theo khuông khi có hai khuông trong cùng một phần MusicXML, hoặc theo cao độ với bản một khuông và MIDI.
3. Trong **Tập từng nốt**, đánh các phím sáng bằng chuột, cảm ứng, đàn MIDI hoặc **Nghe tiếng đàn**. Bạn có thể đánh lần lượt các nốt trong một hợp âm. Bài tự chuyển bước khi bạn hoàn tất hợp âm.
4. Bấm **Nghe mẫu** để nghe từ bước đang chọn. Có ba mức **Chậm 60%**, **Gốc 100%** và **Nhanh 125%**, cùng thanh chỉnh từ 25% đến 150%. Ứng dụng mặc định ở mức 60% và ghi nhớ tốc độ đã chọn cho lần mở sau.

Bật **Số ngón** để xem ngón 1–5 của các nốt trong hai khuông đang xem, trong ô nốt cần đánh và trên phím sáng. Tay phải dùng màu xanh lá, tay trái dùng màu tím. Ngón 1 là ngón cái ở cả hai tay. Ứng dụng dùng số ngón ghi trong MusicXML khi đọc được và gợi ý dựa trên hướng giai điệu, tay chơi và thế hợp âm cho các nốt còn lại.

Thư viện tệp nhập tồn tại trong phiên hiện tại. Khi MusicXML có ký hiệu lặp, ứng dụng đi theo thứ tự các ô nhịp trong tệp.

Chọn **Tên nốt trên phím đàn** để đổi giữa C–B và Đô–Si. Với bản không có khóa Fa và có ký hiệu hợp âm đọc được, ứng dụng tạo phần đệm tay trái bằng các nốt bấm cùng lúc và giữ đến hợp âm kế tiếp. Với bản có khóa Fa, phần tay trái lấy từ khuông nhạc.

Các hợp âm đã đối chiếu trong **Sheet Music** được gắn vào ô nhịp và phách trên PDF gốc. Tay trái có thể đổi hợp âm trong lúc giai điệu ngân hoặc nghỉ. **Vị Ngọt Đôi Môi** dùng khuông Piano. Với **Xin Còn Gọi Tên Nhau**, chọn dòng hợp âm trước khi bấm **Tập cả bản**. Với MusicXML, ứng dụng dùng dữ liệu hợp âm trong tệp.

## Tập theo nhịp

Chọn tốc độ rồi bấm **Tập theo nhịp** để nghe phách trong khi tự đánh trên KS1. **Đếm vào bài** phát tiếng gõ một ô nhịp trước khi bắt đầu. **Metronome** tiếp tục gõ trong lúc tập hoặc nghe mẫu, với phách đầu ô nhịp được nhấn rõ hơn. Hai tùy chọn có thể bật tắt riêng. Ứng dụng dùng nhịp và thay đổi tempo có trong bản nhạc khi đọc được.

Bật **Chấm nhịp & trường độ** rồi bấm **Tập theo nhịp** để bản tập chạy theo metronome. Phần kết quả ghi tên nốt, vị trí, độ lệch sớm hoặc muộn, trường độ giữ và nốt bị bỏ sót. Khi đổi tốc độ giữa lượt, bấm **Tập theo nhịp** để chấm tiếp ở tốc độ mới. Với MIDI, ứng dụng đo theo lúc bấm và thả phím. Với micro, trường độ được ước lượng từ tiếng đàn nghe được, nhất là khi dùng pedal hoặc có tiếng vang.

## Nghe tiếng đàn KS1

Trong chế độ **Tập từng nốt**, bấm **Nghe tiếng đàn**, cấp quyền micro rồi chọn đầu vào âm thanh USB của KS1 nếu máy tính đã nhận đàn. Bạn cũng có thể chọn micro và bật loa đàn. Bạn có thể đánh nốt đơn hoặc bấm đồng thời các phím của hợp âm. Đèn phím và dòng “Nghe được” hiển thị các nốt đã nhận. Với Safari trên iPhone, mở địa chỉ HTTPS của ứng dụng và cấp quyền micro. Bấm **Dừng nghe** để tắt đầu vào. Âm thanh được phân tích trên máy.

## Đọc PDF trong Sheet Music

Khi tập từ PDF hoặc PNG, **Hiển thị sheet nhạc** cho xem tối đa hai khuông gốc cùng lúc. Dùng **‹ / ›** để xem các khuông khác, hoặc mở bản gốc để xem toàn trang. Bấm **Phóng to** để tăng kích thước khuông 50% và vuốt ngang. Khung tự cuộn ngang theo vị trí nốt trong khi tập. Với **Tập cả bản** từ Sheet Music, con trỏ theo từng đầu nốt trên PDF và tự chuyển khuông, chuyển trang khi bạn tập hoặc nghe mẫu. Bạn có thể chọn trang hoặc chạm gần một đầu nốt để đến vị trí đó. Tọa độ của các bản MusicXML được ghép từ dữ liệu Audiveris. Một số đầu nốt cần ước lượng vị trí theo khuông.

Chọn **Tập cả bản** khi PDF có MusicXML đi kèm. Ứng dụng ghép bản tập theo nội dung của tệp PDF, nên vẫn tìm được khi bạn đổi tên. Với bản xuất tự động, độ chính xác phụ thuộc vào kết quả nhận dạng ký âm của Audiveris. Xem báo cáo `Sheet Scores/ket-qua.csv` để biết tệp nào đọc được và kiểm tra số nốt, ô nhịp, dấu hóa và trường độ.

Để cập nhật khi thêm PDF, chạy `node convert-library.js`, `python audit-library.py` và `python -X utf8 build-score-cursors.py`. Sau khi bổ sung ký hiệu đã đối chiếu trong `reviewed-chords.json`, chạy `python -X utf8 build-reviewed-chords.py`. Đặt `PIANO_AUDIVERIS_HOME` trỏ tới thư mục Audiveris có `app` và `runtime` nếu bộ chuyển đổi nằm ngoài vị trí tạm mặc định. Tệp đã xuất sẽ được dùng lại. Trình ghép tọa độ dùng tệp `.omr` trong thư mục tạm của quá trình chuyển đổi.

Khi chạy bằng `node server.js`, mục **Sheet Music** tự liệt kê các PDF trong thư mục cùng tên. Nếu mở trực tiếp `index.html`, bấm **Chọn thư mục PDF** rồi chọn thư mục Sheet Music. Bạn cũng có thể kéo một tệp PDF vào ứng dụng.

Mở **Tùy chọn khuông và chỉnh nốt** để chọn **Tập khuông này** hoặc **Tập cả trang**. Khi đánh đàn hay nghe mẫu, con trỏ đánh dấu vị trí trên PDF. Chạm đầu nốt để chuyển đến đoạn muốn tập. Trong **Lặp đoạn A–B**, đặt đầu đoạn A và cuối đoạn B tại hai bước đang chọn rồi bật **Lặp A–B**.

PDF **Anh Cho Em Mùa Xuân** trong thư mục có bản chép riêng theo 10 khuông của trang 1, gồm hóa biểu ba dấu thăng, trường độ, dấu nối, nốt hoa mỹ và hai kết bài. Bản nghe mẫu dùng tốc độ nền 63 BPM.

Với PDF khác, chọn khóa và hóa biểu cho từng khuông. Các vòng xanh trong chế độ chỉnh sửa đánh dấu kết quả nhận diện. Bạn có thể thêm, sửa, xóa nốt hoặc chọn **Tìm đầu nốt cùng hình** rồi chạm giữa đầu nốt mẫu. Chọn trường độ và dấu hóa khi sửa. Bấm lại nút tập để áp dụng. Dữ liệu sửa được giữ trong lần mở PDF hiện tại. **Tập cả trang** đọc lần lượt từ khuông trên xuống khuông dưới.

## Nhận diện ảnh PNG

Chọn ảnh bản in rõ, khuông ngang, có khóa Sol và đầu nốt tô đen. Với bản piano hai khuông, hãy cắt riêng dòng giai điệu khóa Sol. Ứng dụng đọc các khuông từ trên xuống và các nốt từ trái sang phải ngay trên máy. Bản tập dùng nốt tự nhiên, một phách mỗi bước và tốc độ mặc định 80 BPM. Hãy đối chiếu với ảnh gốc vì dấu hóa, trường độ, dấu lặng và ký hiệu phức tạp có thể làm sai kết quả.

## Kết nối đàn MIDI

Với **Kurtzman KS1**, bật đàn và nối cổng USB của đàn với máy tính bằng cáp dữ liệu. Bấm **Kết nối MIDI** và cấp quyền trong trình duyệt. Ứng dụng ưu tiên cổng có tên Kurtzman hoặc KS1. Nếu máy tính hiển thị tên chung, hãy chọn cổng tương ứng trong **Cổng đàn**. Nhấn một phím để kiểm tra tên nốt cạnh bộ chọn. [Thông tin kết nối của hãng](https://kurtzman.vn/piano-dien-kurtzman/)

Riêng ảnh **Thu Tinh Em Gai_Quy Phi_Em_440001.png** đi kèm dự án có bản chép 75 ô nhịp, 67 BPM và hai dòng Ca, Đàn. Ứng dụng nhận biết nội dung của ảnh khi nhập, kể cả khi đổi tên tệp. Có thể tập từng dòng hoặc cả hai. Các nốt hoa mỹ nhỏ được lược bỏ. Ảnh đã cắt hoặc lưu lại sẽ dùng bộ nhận diện PNG thông thường.

Dùng Chrome hoặc Edge. Nếu trình duyệt giới hạn MIDI khi mở trực tiếp tệp, chạy lệnh sau từ thư mục dự án bằng Node.js:

```powershell
node server.js
```

Mở [ứng dụng trên localhost](http://127.0.0.1:4173), cắm đàn rồi bấm **Kết nối MIDI** để cấp quyền truy cập. Nhấn `Ctrl+C` để dừng máy chủ.
