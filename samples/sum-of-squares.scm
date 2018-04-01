;;; Expected result: 91
(letrec
    ((square
      (lambda (x)
        (* x x)))
     (sum-of-squares
      (lambda (squares)
        (if (null? squares)
            0
            (+ (square (car squares))
               (sum-of-squares (cdr squares))))))
     (make-num-list
      (lambda (n max)
        (if (> n max)
            '()
            (cons n (make-num-list (+ n 1) max))))))
  (sum-of-squares (make-num-list 1 6)))
