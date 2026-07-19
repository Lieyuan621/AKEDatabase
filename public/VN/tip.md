AKEData đã chuyển sang tên miền www.akedata.wiki. Tên miền cũ akedata.top hiện chuyển hướng đến đây.

# Nhật ký cập nhật phiên bản AKEData

### v1.2.2

Giá trị gốc và công thức giờ mở trong cửa sổ nổi duy trì khi nhấp vào một số, thay cho chú thích xuất hiện chậm khi rê chuột. Nhấp giá trị khác sẽ đổi nội dung; nhấp vùng trống của trang hoặc nhấn Esc sẽ đóng. Cửa sổ tự định vị lại khi cuộn hay đổi kích thước, hỗ trợ thiết bị di động và bàn phím, đồng thời không thay đổi kiểu hiển thị của các số.

Đã sửa lỗi bộ xử lý nhấp của phần tử cha trong một số mô-đun khiến nhấp chuột thật không mở được cửa sổ. Đồng thời sửa giá trị kỹ năng của `chr_0032_lizhiyan` hiển thị thành `[object Object]`; các cấu trúc số phổ biến giờ được giải nén an toàn.

### v1.2.1

Đã sửa lỗi khiến một số hình ảnh trò chơi có thể bị yêu cầu nhầm từ `www.akedata.wiki` sau khi chuyển mô-đun hoặc khởi động lại Service Worker. Đường dẫn hình ảnh giờ được viết lại đồng bộ sang `data.akedata.wiki` khi được chèn vào trang.

Service Worker giờ khôi phục nguồn dữ liệu và phiên bản dữ liệu dùng chung từ URL đăng ký. Vì vậy trạng thái định tuyến hình ảnh vẫn được giữ khi trình duyệt dừng rồi khởi động lại Worker. Biểu tượng trang web cũng được tải trực tiếp từ nguồn dữ liệu.

Đã bổ sung phân tích dữ liệu kẻ địch từ `LevelScriptData` vào phép tính thuộc tính của Phó bản, Contingency Contract và Echoes of War. Hệ thống giờ đọc kẻ địch, cấp độ và Buff khi xuất hiện được định nghĩa trực tiếp trong script, cùng các Buff có điều kiện áp dụng qua bộ sinh. Nhờ đó các màn không có SpawnerConfig vẫn được tính chính xác. Việc tải trước Buff điều kiện và tính lại sau khi đổi điều kiện cũng đã được sửa.

Cải thiện chú thích giá trị gốc. Giá trị không bị thay đổi bởi phép tính vẫn hiển thị giá trị gốc; giá trị bị thay đổi bởi thuộc tính, Buff, điều kiện hợp đồng hoặc biểu thức giờ hiển thị giá trị gốc, tham số thay thế, công thức đầy đủ và kết quả cuối. Theo dõi công thức áp dụng cho Phó bản, Contingency Contract, Echoes of War, kẻ địch và biểu thức của nhân vật, vũ khí, trang bị cùng vật phẩm.

### v1.2.0

Đã bổ sung tính năng so sánh dữ liệu giữa các phiên bản trò chơi. Khi chọn `Latest`, trang web tự động so sánh với Hotfix cuối cùng của phiên bản trước. Dữ liệu mới luôn được đưa lên đầu và gắn nhãn; nhãn dữ liệu sửa đổi cùng Diff chi tiết có thể bật bằng tùy chọn thử nghiệm trong cài đặt toàn cục, mặc định tắt.

Diff chi tiết chỉ so sánh thông tin thực sự hiển thị trên trang, tô đỏ nội dung bị xóa, tô xanh nội dung được thêm và bỏ qua trường ẩn. Hoạt động không tham gia phát hiện dữ liệu mới. Trang bị và huy chương được so sánh theo từng ID, đồng thời gắn nhãn cho bộ hoặc danh mục tương ứng. Viền thẻ vẫn dùng màu độ hiếm.

### v1.2.0-pre2

Đã cập nhật toàn bộ ánh xạ Attribute, bổ sung ID 93–100 và đồng bộ `maps.json` cho cả 14 ngôn ngữ.

Module quái và phụ bản giờ sử dụng các tham số kháng nguyên tố mới (ID 94–99). Các ID hệ số kháng cũ 80–85 không còn xuất hiện trong thẻ thuộc tính, phần tóm tắt modifier hay tooltip Buff liên quan.

### v1.1.9

Thêm module chuyên đề cho thử thách thường trực “Tiếng vọng chiến tranh”, cho phép xem màn chơi, độ khó, danh hiệu xếp hạng, phần thưởng công trạng và hướng dẫn chính thức theo mùa và chu kỳ luân phiên. Module cũng hiển thị đợt quái, bản đồ vị trí xuất hiện, Buff khi sinh và thuộc tính đã điều chỉnh theo cấp, kèm chuyển đợt và tô sáng liên kết trên bản đồ.

### v1.1.8

Thêm chế độ debug và chức năng buộc làm mới cache web; sửa node thuộc tính nhân vật và cách phân tích chi phí phát triển dựa trên mô tả vật phẩm; chuyển loại hoạt động sang ActivityTagTable; đọc trực tiếp style và thuật ngữ rich text từ TableCfg; đồng thời thêm nút trang chủ ở thanh bên cho các module có trang khởi đầu.

### v1.1.6

Thêm thông báo trong trang và đếm ngược cập nhật, hỗ trợ nhóm skill hai hình thái của Jue, tối ưu thông báo tải và loại bỏ nhiều module v2 đã ngừng sử dụng.

### v1.1.5

Ra mắt framework đa ngôn ngữ, hỗ trợ chuyển đổi ngôn ngữ cho giao diện, module, bộ lọc và ánh xạ dữ liệu, đồng thời bổ sung đợt tài nguyên đa ngôn ngữ đầu tiên.

### v1.1.4

Sửa tham số phiên bản của yêu cầu dữ liệu, tách phiên bản làm mới tài nguyên ứng dụng và dữ liệu công khai, đồng thời thống nhất cách xác định phiên bản của cache trang và Service Worker.

### v1.1.3

Thêm hiệu ứng sử dụng vật phẩm tiêu hao và công thức chế tạo vào module vật phẩm, bổ sung quan hệ nguyên liệu với sản phẩm, kiểu hiển thị chi tiết và bộ chuyển đổi dữ liệu v3 tương ứng.

### v1.1.2

Thêm lối vào tổng quan dạng thẻ theo nhóm cho các module nhân vật, vũ khí, kẻ địch, trang bị, hoạt động, vật phẩm, phó bản, huy chương, nghiên cứu và các module khác.

### v1.1.1

Thiết kế lại bộ lọc phân loại vật phẩm, hỗ trợ thu gọn và đếm kết quả lọc; đồng thời tăng cường chống trùng yêu cầu, cache IndexedDB và hiển thị tiến trình tải dữ liệu.

### v1.1.0

Ra mắt lớp chuyển đổi dữ liệu v3 dựa trên TableCfg và Json, bao phủ các module tra cứu chính, đồng thời thêm cơ chế vô hiệu hóa module và cache tệp dữ liệu lớn.

### v1.0.31

Từng thêm chuyển đổi giao diện Trung-Anh, thư mục dữ liệu và cấu hình quốc tế hóa liên quan, nhưng tính năng này sau đó được rollback hoàn toàn và không tiếp tục cung cấp ở giai đoạn này.

### v1.0.30

Thêm wrapper cache yêu cầu thống nhất, chuyển các trang sang dùng akeFetch để tải dữ liệu, qua đó giảm yêu cầu lặp lại và tối ưu logic tải khi chuyển module.

### v1.0.29

Tách script nhúng của trang chủ và các module sang thư mục plugin/js, tập trung quản lý routing, thiết lập, tính toán thuộc tính và controller module.

### v1.0.28

Thêm gợi ý giá trị gốc cho tham số của phần lớn module, đồng thời sửa phép tính HP quái vật và lỗi hiển thị "giảm toàn bộ damage".

### v1.0.27

Thêm trực quan hóa wave quái vật cho Contingency Contract, hỗ trợ tọa độ spawn, chuyển wave và highlight liên kết, đồng thời sửa thống kê gộp các wave lặp lại.

### v1.0.26

Thêm xem thuộc tính kẻ địch cho Contingency Contract, cho phép tính và hiển thị thuộc tính thực tế theo level, Buff khi spawn và tag hợp đồng đã chọn.

### v1.0.25

Tải trước và mở module Contingency Contract bị giới hạn bởi Token, hỗ trợ tìm season, điều kiện và xung đột tag, tính điểm, reward, nhiệm vụ và hiển thị shop.

### v1.0.24

Cập nhật hiển thị skill nhân vật v2, sửa thứ tự Combo Skill và Ultimate Skill, đồng thời giữ lại các tham số quan trọng như cooldown và tiêu hao năng lượng.

### v1.0.23

Chính thức mở module nghiên cứu, tăng cường Markdown, syntax highlighting, mục lục, chuyển anchor và xem trước hình ảnh, đồng thời thêm các bài nghiên cứu cơ chế.

### v1.0.22

Thêm giới hạn truy cập module và nội dung dựa trên Token, hỗ trợ lưu bền Token, thêm hàng loạt và xóa, đồng thời tải trước nội dung được bảo vệ.

### v1.0.21

Thêm hệ số physical abnormal damage và arts abnormal damage vào bảng tăng trưởng thuộc tính nhân vật v2, đồng thời cung cấp độ chính xác khác nhau theo chế độ hiển thị.

### v1.0.20

Điều chỉnh thứ tự và một số tên thuộc tính chi tiết của kẻ địch, đưa mục interrupt resistance và execution lên trước, đồng thời thống nhất cách gọi các tag bonus damage.

### v1.0.19

Thêm hiển thị equipment ID trong module trang bị, sắp xếp lại style v2 của nhân vật, vũ khí và trang bị, đồng thời sửa màu thuộc tính và cách chọn giá trị tăng trưởng.

### v1.0.18

Thêm deep link cho module và mục dữ liệu, đồng bộ address bar khi điều hướng và xử lý nội dung bị ẩn hoặc không tồn tại, đồng thời hoàn thiện hiển thị loại hiệu chỉnh thuộc tính nhân vật.

### v1.0.17

Chính thức ra mắt vũ khí v2, cung cấp tìm kiếm vũ khí và hiển thị chi tiết thuộc tính theo level, nguyên liệu breakthrough, potential cùng skill.

### v1.0.16

Chính thức ra mắt trang bị v2, hiển thị bộ phận theo set, thuộc tính chính và phụ, set skill, công thức chế tạo, bảo đảm precision forging và thông tin enhancement.

### v1.0.15

Chính thức ra mắt phó bản v2, hỗ trợ chi tiết chuỗi phó bản, reward và kẻ địch, đồng thời phân tích cấu hình spawn cùng Buff để hiển thị wave và thuộc tính sau hiệu chỉnh.

### v1.0.14

Chính thức ra mắt kẻ địch v2, bổ sung tìm kiếm, danh sách mobile, thuộc tính theo level, biến thể kẻ địch, hiệu chỉnh thuộc tính, resistance và thông tin stagger.

### v1.0.13

Chính thức ra mắt nhân vật v2, tái cấu trúc thuộc tính, skill, talent, potential và thông tin tăng trưởng, đồng thời sửa hiển thị trait, hình ảnh và node.

### v1.0.12

Nâng cấp timeline SkillData v2, thêm lọc action, flowchart nhánh điều kiện, ẩn hiện node và gợi ý thời lượng frame, đồng thời sửa một số giá trị quái vật.

### v1.0.11

Thêm chế độ debug SkillData v2 bị ẩn, trình bày logic skill bằng timeline và action node, đồng thời hỗ trợ tìm kiếm và xem dữ liệu gốc.

### v1.0.10

Tiếp tục tái cấu trúc nhân vật v2, xây dựng trang chi tiết nhân vật mới và kết nối dữ liệu nhân vật đầy đủ, đồng thời hoàn thiện ánh xạ field và cấu trúc hiển thị.

### v1.0.9

Thêm module tra cứu SpawnerConfig, cho phép duyệt dữ liệu spawner theo scene và cấu hình, đồng thời điều chỉnh lối vào tra cứu BuffData và SkillData.

### v1.0.8

Thêm module tra cứu BuffData và SkillData, hỗ trợ duyệt manifest, tìm kiếm và xem chi tiết, tạo lối vào để nghiên cứu dữ liệu chiến đấu tầng thấp.

### v1.0.7

Thêm tra cứu thông tin hoạt động, điều chỉnh hiển thị mặc định tag nhân vật và hỗ trợ tag đặc biệt của Rossi, đồng thời bổ sung thống kê lượt truy cập trang web.

### v1.0.6

Thêm danh sách nhà tài trợ và style tương ứng vào trang Giới thiệu, hoàn thiện phần hiển thị lời cảm ơn của dự án.

### v1.0.5

Hoàn thành thích ứng mobile cho các module chính như nhân vật, vũ khí, kẻ địch, trang bị, vật phẩm, phó bản và achievement, cùng cả ba theme.

### v1.0.4

Thêm bộ lọc cho các module nhân vật, vũ khí và vật phẩm, tái cấu trúc khu vực lọc danh sách để tăng hiệu quả tìm kiếm khi có nhiều mục.

### v1.0.3

Thêm giao diện tra cứu vật phẩm và đăng ký module vật phẩm, hỗ trợ danh sách, chi tiết vật phẩm cùng phần hiển thị thông tin cơ bản liên quan.

### v1.0.2

Thêm icon skill và hiển thị base skill trên trang nhân vật, gồm loại facility, level skill, mô tả và điều kiện unlock, đồng thời sửa dữ liệu liên quan.

### v1.0.1

Sửa lỗi hiển thị bất thường của dữ liệu thuộc tính cố định kẻ địch, đồng thời hoàn thiện thông tin kẻ địch trên trang phó bản.

### v1.0.0

AKEData 1.0 chính thức ra mắt, tập trung hoàn thiện nội dung tra cứu phó bản và nâng phiên bản dự án từ 0.99 lên 1.0.
