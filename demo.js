/**
 * 代码中的类名、方法名、参数名已经指定，请勿修改，直接返回方法规定的值即可
 *
 * 计算成功举办活动需要多少名主持人
 * @param n int整型 有n个活动
 * @param startEnd int整型二维数组 startEnd[i][0]用于表示第i个活动的开始时间，startEnd[i][1]表示第i个活动的结束时间
 * @return int整型
 */
// 按照结尾时间升序
function minmumNumberOfHost(n, startEnd) {
    // write code here
    const list = startEnd.sort((a, b) => {
        return a[0] - b[0];
    });
    let result = 0;
    while (list.length) {
        let endNum = list[0][1];
        result++;
        list.shift();
        let index = 0;
        while(index<list.length){
            if(list[index][0] >= endNum){
                endNum = list[index][1];
                list.splice(index, 1);
            }else{
                index++;
            }
        }
    }
    return result;;
}
module.exports = {
    minmumNumberOfHost: minmumNumberOfHost,
};
